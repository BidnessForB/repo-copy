#! /usr/bin/env node
/*jshint esversion: 6 */

/**
 * Created by bryancross on 12/27/16.
 *
 */


const appDebug = require('debug')('Repo:appDebug');
const appError = require('debug')('Repo:appError');
const appOutput = require('debug')('Repo:appOutput');
const JCompare = require('./json-compare.js');
const HashMap = require('hashmap');
const RG = require('./RepoGetter');
const RC = require('./RepoCreator');

module.exports = Repo;

function Repo()
{
    this.repoData = {};
    this.config = {};
    this.config.repoArgs = {};
    return this;
}

Repo.prototype.initRest = function(params,response)
{
    try {
        this.response = response;
        this.config = {};
        this.config.ghPAT = params.headers.authorization;
    }
    catch(err)
    {
        if(this.response)
        {
            this.respond(500,'Error configuring server',err);
        }
    }
};

/*
 * Where the magic happens.  Execute logic based on the mode passed in
 * When it's all over, return results via the http response and/or a callback
 * function
 *
 * arguments:
 * params   (object) -  parameters mimicking an http request.  the function requires
 *                      params.body - JSON string
 *                      params.headers.authorization - A valid GitHub PAT
 *
 * response (object) - an HTTP response, or null if not being called via REST
 * mode     (string) - 'get'   : get config for specified repo
 *                     'audit' : return diffs for 2 repos specified in params
 *                     'create': create a new repo based on values supplied in params
 * caller (function) - Function to be called back upon completion.  Accepts a
 *                     single argument, the data returned.
 *
 */

Repo.prototype.executeRest = async function(params, response, mode, caller) {

    this.initRest(params,response);
    this.caller = caller;
    this.mode = mode;
    this.repos = [];
    let that = this;
    let repoParam = {};
    let start = new Date();
    let rg;
    let rc;
	let templateRepoOwner;
	let templateRepoName;
	let tokens;
	let newRepoOwner;
	let newRepoName;
	let restParams;
	let templateRepoParam;


    if(mode === 'get' || mode === 'audit') {
        try {
            this.restParams = JSON.parse(params.body);
            this.validateArgs(restParams, mode);
            if(mode === 'audit' && this.restParams.length !== 2)
            {
                this.respond(400,'Two repository URLs are required for audit');
                return;
            }

            this.repos = new HashMap();
            for (var i = 0; i < this.restParams.length; i++) {
                repoParam = {
                    owner: this.restParams[i].URL.split('/')[3],
                    repo: this.restParams[i].URL.split('/')[4]
                };
                    rg = new RG(this.config.ghPAT, repoParam,function (name, repo, err) {
						let keys;
						let retval = [];
						let errMsg;
						let diffs;

                        if (err)
                        {
                            that.repos.set(name, "ERROR: " + err.message);
                        }
                        that.repos.set(repo.repo.name, repo);
                        if (that.repos.size === that.restParams.length) {
                            keys = that.repos.keys();
                            for (var r = 0; r < keys.length; r++) {
                                retval.push(that.repos.get(keys[r]));
                            }
                            if(that.mode === 'get')
                            {
                                that.respond(201, retval);
                                if(that.caller){
                                    that.caller(retval);
                                }

                            }
                            else if (that.mode === 'audit')
                            {
                                if(retval[0].errors.length || retval[1].errors.length)
                                {
                                    errMsg = JSON.stringify({message:[retval[0].errors,retval[1].errors]});
                                    that.respond(501,"Errors were encountered retrieving configuration for one or more comparison repos ", new Error(errMsg));
                                }
                                diffs = JCompare.compareJSON(retval[0],retval[1]);
                                that.respond(201,diffs);
                                if(that.caller){
                                    that.caller(diffs);
                                }
                            }
                        appDebug("ELAPSED TIME: " + (new Date() - start) + "ms");
                    }
                });
                rg.execute();
            }
        }
        catch (err) {
            appError("ERROR: " + err.message);
            this.respond(501, "Error retrieving repo configs", err);
        }
    }
    else if(mode === 'create')
    {

        try
        {
            restParams = JSON.parse(params.body);
			templateRepoOwner = restParams.templateRepoURL.split('/')[3];
			templateRepoName = restParams.templateRepoURL.split('/')[4];
			tokens = restParams.tokens;
			newRepoOwner = restParams.newRepoOwner;
			newRepoName = restParams.newRepoName;
        }
        catch(err)
        {
            this.respond(501,"Error parsing configuration",err);
            return;
        }
        try {

            templateRepoParam = {owner: templateRepoOwner, repo: templateRepoName};
            rg = new RG(this.config.ghPAT,templateRepoParam, function (name, repo, err) {
				if (err) {
					this.respond(501, "Error retrieving template repo configuration", err);
					return
				}
				rc = new RC(that.config.ghPAT, repo, newRepoOwner, newRepoName, tokens, async function (name, repo, err) {
					if (err) {
						appError("ERROR: " + err.message);
						return;
					}
					that.respond(201, repo);
					appDebug("TIME: " + (new Date() - start));
					return;
				});
				rc.execute();
			});
            rg.execute();
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
    if(this.response)
    {
        this.response.respond(status,msg,err);
    }
};

Repo.prototype.validateArgs = function(args, mode)
{

		const validModes = ['get', 'create', 'audit'];
		const urlRegExp = /https:\/\/github.com\/[a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+$/g;
		var errs = [];

		if(mode === 'get')
		{
			if(!args)
			{
				errs.push("URL array argument is missing or undefined");
			}
			else if(typeof args !== 'array')
			{
				errs.push("URL argument must be an array of URLs");
			}
			else if(args.length != 1)
			{
				errs.push("GET accepts only one argument, an array of URLs");
			}
			args.map(function(curValue,index,args))




		}

		if (!args.templateRepoURL) {
			errs.push('Invalid template URL');
		}
		if (args.templateRepoURL && !urlRegExp.test(args.templateRepoURL)) {
			errs.push('Invalid URL: Must be https://github.com/<owner>/<repo>');
		}
		if (validModes.indexOf(args.mode) < 0) {
			errs.push('Invalid mode. valid values are get, create, audit');
		}
		if (args.mode === 'create' && !(args.targetRepoName && args.targetRepoOwner)) {
			errs.push('Missing target repo information.  Please specify targetRepoName and targetRepoOwner');
		}

		return errs;

}


Repo.prototype.callback = function(step){

    appDebug("Finished " + step + " " + this.taskList.size);

    this.taskList.delete(step);
    if(this.taskList.size == 0)
    {
        appOutput(this.repoData);
        this.respond(201,this.repoData);
    }
};

