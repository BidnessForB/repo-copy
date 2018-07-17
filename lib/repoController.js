#! /usr/bin/env node
/**
 * Created by bryancross on 12/27/16.
 *
 */

'use strict';

var http = require('http');
var debug = require('debug');
var JCompare = require('./json-compare.js');
var HashMap = require('hashmap');
var RG = require('./repoGetter');
var RC = require('./repoCreator');
module.exports = Repo;





function Repo()
{
    this.repoData = {};
    this.config = {};
    this.config.repoArgs = {};
    return this;
};

Repo.prototype.init = function(args)
{
    /*
        args:  GHPAT TEMPLATEURL NEWREPOOWNER NEWREPONAME ASYNC
     */
    this.args = args;
    this.config.ghPAT = process.env.GH_PAT;
    this.config.repoArgs.templateRepo = {repo:this.args.templateRepoURL.split('/')[4],owner:this.args.templateRepoURL.split('/')[3]};
    this.config.repoArgs.newRepo={repo:args.newRepoName,owner:args.newRepoOwner};
    if(args.length == 7)
    {
        this.config.async = args[6] == 'async';
    }
};

Repo.prototype.initRest = function(req,res)
{
    try {
        this.req = req;
        this.res = res;
        this.config = {};
        this.config.ghPAT = req.headers.authorization;
    }
    catch(err)
    {
        if(this.res)
        {
            this.respond(500,'Error configuring server',err);
        }
    }
};

Repo.prototype.execute = async function(args){

    var templateRepo;
    var newRepo;
    this.init(args);
    if(args.mode == 'get')
    {
        templateRepo = await this.getRepoData(args.templateRepoURL.split('/')[3] , args.templateRepoURL.split('/')[4]);
        return this.trimRepoData(templateRepo);
    }
    else if(args.mode == 'create')
    {
        templateRepo = await this.getRepoData(args.templateRepoURL.split('/')[3] , args.templateRepoURL.split('/')[4]);
        newRepo = await this.createRepo(templateRepo, args.targetRepoName, args.targetRepoOwner, args.tokens);
        return newRepo;
    }
    else if(args.mode == 'audit')
    {
        var diffs;
        if(!args.templateRepoURL || !args.compareRepoURL)
        {
            throw new Error("Malformed or missing template or compare URL");
        }


        var repo1owner = args.templateRepoURL.split('/')[3];
        var repo1name = args.templateRepoURL.split('/')[4];
        var repo2owner = args.compareRepoURL.split('/')[3];
        var repo2name = args.compareRepoURL.split('/')[4];


        diffs = this.compareRepos(repo1owner,repo1name,repo2owner,repo2name)

        return diffs;

    }
};

Repo.prototype.executeRest = async function(req, res, mode) {

    var repoData;
    var newRepoData;
    this.initRest(req,res);

    this.mode = mode;
    this.repos = [];
    var that = this;


    if(mode == 'get' || mode == 'audit') {
        try {
            this.restParams = JSON.parse(req.body);
            if(mode == 'audit' && this.restParams.length != 2)
            {
                this.respond(400,'Two repository URLs are required for audit');
                return;

            }

            this.repos = new HashMap();
            for (var i = 0; i < this.restParams.length; i++) {
                var repoParam = {
                    owner: this.restParams[i].URL.split('/')[3],
                    repo: this.restParams[i].URL.split('/')[4]
                };
                var start = new Date();
                var rg = new RG(this.config.ghPAT, repoParam,function (name, repo, err) {
                    if (err) {
                        that.repos.set(name, "ERROR: " + err.message);
                    }
                    that.repos.set(repo.repo.name, repo);
                    if (that.repos.size == that.restParams.length) {
                        var keys = that.repos.keys();
                        var retval = [];

                        for (var r = 0; r < keys.length; r++) {
                            retval.push(that.repos.get(keys[r]));
                        }
                        if(that.mode == 'get')
                        {
                            console.log(JSON.stringify(retval));
                            that.respond(201, retval);
                        }
                        else if (that.mode == 'audit')
                        {
                            if(retval[0].errors.length || retval[1].errors.length)
                            {
                                var errMsg = JSON.stringify({message:[retval[0].errors,retval[1].errors]});
                                that.respond(501,"Errors were encountered retrieving configuration for one or more comparison repos ", new Error(errMsg));
                            }
                            var diffs = JCompare.compareJSON(retval[0],retval[1]);
                            that.respond(201,diffs);
                            console.log(JSON.stringify(diffs));
                        }
                        console.log("TIME: " + (new Date() - start));
                    }
                });
                rg.execute();
            }
        }
        catch (err) {
            console.log("ERROR: " + err.message);
            this.respond(501, "Error retrieving repo configs", err);
        }
    }
    else if(mode == 'create')
    {

        try
        {
            var restParams = JSON.parse(req.body);
            var templateRepoOwner = restParams.templateRepoURL.split('/')[3];
            var templateRepoName = restParams.templateRepoURL.split('/')[4];
            var tokens = restParams.tokens;
            var newRepoOwner = restParams.newRepoOwner;
            var newRepoName = restParams.newRepoName;
        }
        catch(err)
        {
            this.respond(501,"Error parsing configuration",err);
            return;
        }
        var start = new Date();
        try {

            var templateRepoParam = {owner: templateRepoOwner, name: templateRepoName};
            var rg = new RG(this.config.ghPAT);
            rg.execute(templateRepoParam, function (name, repo, err) {
                if (err) {
                    this.respond(501, "Error retrieving template repo configuration", err);
                    return
                }
                var rc = new RC(that.config.ghPAT, repo, newRepoOwner, newRepoName, tokens, async function (name, repo, err) {
                    if (err) {
                        console.log("ERROR: " + err.message);
                        return;
                    }
                    that.respond(201, repo);
                    console.log("TIME: " + (new Date() - start));
                    return;
                });
                rc.execute();
            });
        }
        catch(err)
        {
            this.respond(501,"Error of some sort",err);
        }
    }
    else
    {
        this.respond(400,"ERROR: Unknown mode (" + this.mode +")");
    }
};

Repo.prototype.respond = function(status,msg,err)
{
    console.log(typeof msg == 'object' ? JSON.stringify(msg) : msg + " " + (err ? err.message : ""));
    if(this.res)
    {
        this.res.respond(status,msg,err);
    }
};


Repo.prototype.callback = function(step){
    console.log("Finished " + step + " " + this.funcList.size);
    this.funcList.delete(step);
    if(this.funcList.size == 0)
    {
        var end = new Date() - this.start;
        console.log("Time: " + end);
        console.log(this.repoData);
        if(this.res)
        {
            this.respond(201,this.repoData);
        }

    }
}

Repo.prototype.execute = async function(owner, name)
{
    this.start = new Date();
    this.funcList = new HashMap();
    this.funcList.set("repo", "repo");
    this.funcList.set("users", "users");
    this.funcList.set("teams", "teams");
    this.funcList.set("branches", "branches");
    this.funcList.set("hooks", "hooks");
    this.funcList.set("tree", "tree");
    this.repoData = {
        repo: {},
        tree: {},
        users: [],
        teams: [],
        branches: [],
        hooks: []
    };

    this.getRepoData(owner,name);
    this.getUsers(owner,name);
    this.getTeams(owner,name);
    this.getBranches(owner,name);
    this.getTree(owner,name);
    this.getHooks(owner,name);
};