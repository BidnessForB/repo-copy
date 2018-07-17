#! /usr/bin/env node
/**
 * Created by bryancross on 12/27/16.
 *
 */

'use strict';

var ghClient = require('@octokit/rest');
var http = require('http');
var debug = require('debug');
var JCompare = require('./json-compare.js');
var HashMap = require('hashmap');
var RG = require('./repoGetter');
var RC = require('./repoCreator');
module.exports = Repo;

//Must get the branches first, before getting branch protection



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
    this.initGitHub();
};

Repo.prototype.initGitHub = function()
{
    this.github = new ghClient({
        baseUrl: 'https://api.github.com'
        ,headers: {'user-agent': 'repo-get'}
        ,debug:true
    });

    this.github.authenticate({
        type: 'token',
        token: this.config.ghPAT
    });
};

Repo.prototype.initRest = function(req,res)
{
    try {
        this.req = req;
        this.res = res;
        this.config = {};
        this.config.ghPAT = req.headers.authorization;
        this.initGitHub();
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
    this.initGitHub();

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
                    name: this.restParams[i].URL.split('/')[4]
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
                            retval.push(that.trimRepoData(that.repos.get(keys[r])));
                        }
                        if(that.mode == 'get')
                        {
                            console.log(JSON.stringify(retval));
                            that.respond(201, retval);
                        }
                        else if (that.mode == 'audit')
                        {
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

Repo.prototype.compareRepos = async function(repo1owner, repo1name, repo2owner, repo2name)
{
    var repo1 = await this.getRepoData(repo1owner,repo1name);
    var repo2 = await this.getRepoData(repo2owner,repo2name);
    var diffs = JCompare.compareJSON(repo1,repo2);
    return diffs;
};

Repo.prototype.respond = function(status,msg,err)
{
    console.log(typeof msg == 'object' ? JSON.stringify(msg) : msg + " " + (err ? err.message : ""));
    if(this.res)
    {
        this.res.respond(status,msg,err);
    }



}

Repo.prototype.buildProtectionOptions = function(branch, owner,repo)
{
    try {
        var templateProtection = branch.protection;
        var retval = {
            owner: owner
            , repo: repo
            , branch: branch.name
            , required_status_checks: null
            , required_pull_request_reviews: null
            , restrictions: null
            , enforce_admins: templateProtection.enforce_admins.enabled
        };

        if (templateProtection.hasOwnProperty('required_status_checks')) {
            retval.required_status_checks = {
                strict: templateProtection.required_status_checks.strict
                , contexts: templateProtection.required_status_checks.contexts
            }
        }
        if (templateProtection.hasOwnProperty('restrictions')) {
            retval.restrictions = {};
            if (templateProtection.restrictions.hasOwnProperty('users')) {
                retval.restrictions.users = this.filterArray(templateProtection.restrictions.users, 'login');
            }
            if (templateProtection.restrictions.hasOwnProperty('teams')) {
                retval.restrictions.teams = this.filterArray(templateProtection.restrictions.teams, 'slug');
            }
        }

        if (templateProtection.hasOwnProperty('required_pull_request_reviews')) {
            retval.required_pull_request_reviews = {};
            retval.required_pull_request_reviews.dismiss_stale_reviews = templateProtection.required_pull_request_reviews.dismiss_stale_reviews;
            retval.required_pull_request_reviews.require_code_owner_reviews = templateProtection.required_pull_request_reviews.require_code_owner_reviews;
            if (templateProtection.required_pull_request_reviews.hasOwnProperty('dismissal_restrictions')) {
                retval.required_pull_request_reviews.dismissal_restrictions = {};
                retval.required_pull_request_reviews.dismissal_restrictions.users = this.filterArray(templateProtection.required_pull_request_reviews.dismissal_restrictions.users, 'login');
                retval.required_pull_request_reviews.dismissal_restrictions.teams = this.filterArray(templateProtection.required_pull_request_reviews.dismissal_restrictions.teams, 'slug');
            }
        }
    }
    catch(err)
    {
        console.log(err);
    }

    return retval;
};

Repo.prototype.filterArray = function (arr,propname)
{
    var retval = [];
    for(var i = 0; i < arr.length;i++) {
        if (arr[i].hasOwnProperty(propname)) {
            retval.push(arr[i][propname]);
        }
        else {
            retval.push(null);
        }
    }
    return retval;
};

Repo.prototype.transformContent = function(content, tokens, format)
{
    var strContent;
    if(!tokens)
    {
        return content;
    }
    if(format && format == 'string')
    {
        strContent = content;
    }
    else if (format && format == 'base64')
    {
        var strContent = Buffer.from(content, 'base64').toString();
    }


    for(var  i = 0;i < tokens.length;i++)
    {
        strContent = strContent.replace('<' + tokens[i][0] + '>', tokens[i][1]);
    }
    if(format && format == 'base64')
    {
        return Buffer.from(strContent).toString('base64');
    }
    else if (format && format == 'string')
    {
        return strContent;
    }
};

Repo.prototype.trimRepoData = function(data)
{
   try {
       if (data.hasOwnProperty('tree')) {
           delete data.tree.sha;
           delete data.tree.url;
           for (var t = 0; t < data.tree.tree.length; t++) {
               delete data.tree.tree[t].sha;
               delete data.tree.tree[t].url
           }
       }
       if (data.hasOwnProperty('branches')) {
           var branch;
           var protection;
           var user;
           var team;

           for (var b = 0; b < data.branches.length; b++) {
               branch = data.branches[b];
               delete branch.sha;
               if (branch.hasOwnProperty('protection')) {
                   protection = branch.protection;
                   delete protection.url;
                   if (protection.hasOwnProperty('enforce_admins')) {
                       delete protection.enforce_admins.url;
                   }
                   if (protection.hasOwnProperty('required_status_checks')) {
                       delete protection.required_status_checks.url;
                       delete protection.required_status_checks.contexts_url;
                   }
                   if (protection.hasOwnProperty('required_pull_request_reviews')) {
                       delete protection.required_pull_request_reviews.url;
                       if (protection.required_pull_request_reviews.hasOwnProperty('dismissal_restrictions')) {
                           delete protection.required_pull_request_reviews.dismissal_restrictions.teams_url;
                           delete delete protection.required_pull_request_reviews.dismissal_restrictions.users_url;
                           delete delete protection.required_pull_request_reviews.dismissal_restrictions.url;
                           if (protection.required_pull_request_reviews.dismissal_restrictions.hasOwnProperty('teams')) {
                               for (var pt = 0; pt < protection.required_pull_request_reviews.dismissal_restrictions.teams.length; pt++) {
                                   delete protection.required_pull_request_reviews.dismissal_restrictions.teams[pt].id;
                                   delete protection.required_pull_request_reviews.dismissal_restrictions.teams[pt].members_url;
                                   delete protection.required_pull_request_reviews.dismissal_restrictions.teams[pt].node_id;
                                   delete protection.required_pull_request_reviews.dismissal_restrictions.teams[pt].privacy;
                                   delete protection.required_pull_request_reviews.dismissal_restrictions.teams[pt].repositories_url;
                                   delete protection.required_pull_request_reviews.dismissal_restrictions.teams[pt].url;
                               }
                           }
                           if (protection.required_pull_request_reviews.dismissal_restrictions.hasOwnProperty('users')) {
                               for (var pu = 0; pu < protection.required_pull_request_reviews.dismissal_restrictions.users.length; pu++) {
                                   delete protection.required_pull_request_reviews.dismissal_restrictions.users[pu].node_id;
                                   delete protection.required_pull_request_reviews.dismissal_restrictions.users[pu].avatar_url;
                                   delete protection.required_pull_request_reviews.dismissal_restrictions.users[pu].gravatar_id;
                                   delete protection.required_pull_request_reviews.dismissal_restrictions.users[pu].url;
                                   delete protection.required_pull_request_reviews.dismissal_restrictions.users[pu].html_url;
                                   delete protection.required_pull_request_reviews.dismissal_restrictions.users[pu].followers_url;
                                   delete protection.required_pull_request_reviews.dismissal_restrictions.users[pu].following_url;
                                   delete protection.required_pull_request_reviews.dismissal_restrictions.users[pu].gists_url;
                                   delete protection.required_pull_request_reviews.dismissal_restrictions.users[pu].starred_url;
                                   delete protection.required_pull_request_reviews.dismissal_restrictions.users[pu].subscriptions_url;
                                   delete protection.required_pull_request_reviews.dismissal_restrictions.users[pu].organizations_url;
                                   delete protection.required_pull_request_reviews.dismissal_restrictions.users[pu].repos_url;
                                   delete protection.required_pull_request_reviews.dismissal_restrictions.users[pu].events_url;
                                   delete protection.required_pull_request_reviews.dismissal_restrictions.users[pu].received_events_url;
                               }
                           }

                       }
                   }
                   if (protection.hasOwnProperty('restrictions')) {
                       delete protection.restrictions.url;
                       delete protection.restrictions.teams_url;
                       delete protection.restrictions.users_url;

                       for (var u = 0; u < protection.restrictions.users.length; u++) {
                           user = protection.restrictions.users[u];
                           delete user.node_id;
                           delete user.avatar_url;
                           delete user.gravatar_id;
                           delete user.url;
                           delete user.html_url;
                           delete user.followers_url;
                           delete user.following_url;
                           delete user.gists_url;
                           delete user.starred_url;
                           delete user.subscriptions_url;
                           delete user.organizations_url;
                           delete user.repos_url;
                           delete user.events_url;
                           delete user.received_events_url;
                           delete user.type;
                           delete user.site_admin;
                       }

                       for (var tt = 0; tt < protection.restrictions.teams.length; tt++) {
                           delete protection.restrictions.teams[tt].id;
                           delete protection.restrictions.teams[tt].node_id;
                           delete protection.restrictions.teams[tt].url;
                           delete protection.restrictions.teams[tt].members_url;
                           delete protection.restrictions.teams[tt].repositories_url;
                       }
                   }
               }
           }
       }
           if (data.hasOwnProperty('hooks')) {
               for (var h = 0; h < data.hooks.length; h++) {
                   var hook = data.hooks[h];
                   delete hook.created_at;
                   delete hook.id;
                   delete hook.ping_url;
                   delete hook.test_url;
                   delete hook.updated_at;
                   delete hook.url;
               }
           }
           if(data.hasOwnProperty('labels'))
           {
               for(var l = 0; l < data.labels.length;l++)
               {
                   var label = data.labels[l];
                   delete label.node_id;
                   delete label.url;
                   delete label.id;
               }
            }
   }
    catch(err)
       {
           console.log(err);
       }
    return data;
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
            this.respond(201,this.trimRepoData(this.repoData));
        }

    }
}

Repo.prototype.getRepoData = async function(owner,name)
{
    console.log("REPO DATA");
    var repo;
    var repoParams = {owner:owner,repo:name};

    try {

        repo = await this.github.repos.get(repoParams);
        this.repoData.repo = {};
        this.repoData.repo.name = repo.data.name;
        this.repoData.repo.description = repo.data.description;
        this.repoData.repo.has_issues = repo.data.has_issues;
        this.repoData.repo.has_projects = repo.data.has_projects;
        this.repoData.repo.has_wiki = repo.data.has_wiki;
        this.repoData.repo.has_pages = repo.data.has_pages;
        this.repoData.repo.allow_squash_merge = repo.data.allow_squash_merge;
        this.repoData.repo.allow_merge_commit = repo.data.allow_merge_commit;
        this.repoData.repo.allow_rebase_merge = repo.data.allow_rebase_merge;
        this.repoData.repo.organization = {};
        this.repoData.repo.organization.login = repo.data.organization.login;

        this.callback("repo");

    }
    catch(err)
    {
        throw(err)
    }

};

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
}

Repo.prototype.getUsers = async function getUsers(owner,name)
{
    console.log("USERS");

    var users = await this.github.repos.getCollaborators({
    owner:owner
    ,repo:name
    ,affiliation:'all'  //this was misspelled.
});

    for(var u = 0;u < users.data.length;u++)
    {
        this.repoData.users.push({login:users.data[u].login,permissions:users.data[u].permissions});
    }

    this.callback("users");

}
Repo.prototype.getBranchProtection = async function(branch,owner,name, callback)
{
    try {
        var protections = await
        this.github.repos.getBranchProtection({
            owner: owner,
            repo: name,
            branch: branch.name
        });
        if(protections)
        {
            branch.protections = protections.data;
            if(protections.hasOwnProperty('required_status_checks'))
            {
                branch.protections.required_status_checks = {}
                branch.protections.required_status_checks.strict = branch.protections.required_status_checks.strict;
            }
        }

        this.callback(branch.name);
    }
    catch(err)
    {
        if(JSON.parse(err).message == 'Branch not protected')
        {
            console.log("No protections for branch " + branch.name);
            this.callback(branch.name);
        }
        else
        {
            throw(err)
        }
    }
};



Repo.prototype.getBranches = async function(owner,name)
{
    console.log("BRANCHES");
    var repoParams = {owner:owner,repo:name};
    var branchList = new HashMap();

    var branches = await this.github.repos.getBranches(repoParams)
    branches = branches.data;

    for (var i = 0; i < branches.length;i++) {
        this.repoData.branches.push({
            name: branches[i].name,
            sha: branches[i].commit.sha
        });
        this.funcList.set(branches[i].name, branches[i].name);
        this.getBranchProtection(branches[i],owner,name)
    }

    this.callback("branches");

}

Repo.prototype.getTeams = async function(owner,name)
{
    console.log("TEAMS");
    var repoParams = {owner:owner,repo:name};
    var teams = await this.github.repos.getTeams(repoParams);

    for(var t= 0;t < teams.data.length;t++)
    {
        this.repoData.teams.push({name:teams.data[t].name,slug:teams.data[t].slug,permission:teams.data[t].permission, id:teams.data[t].id});
    }

    this.callback("teams");
}

Repo.prototype.getHooks = async function(owner,name)
{
    console.log("HOOKS");
    var repoParams = {owner:owner,repo:name};
    this.repoData.hooks = await this.github.repos.getHooks(repoParams);
    this.callback("hooks");
}

Repo.prototype.getTree = async function(owner,name)
{
    console.log("TREE");
    var masterSHA = await this.github.gitdata.getReference({
    owner: owner
    ,repo: name
    ,ref: 'heads/master'
});

    var masterTree = await this.github.gitdata.getTree({
    owner: owner
    ,repo: name
    ,tree_sha: masterSHA.data.object.sha
    ,recursive:1
});

    this.repoData.tree = masterTree.data;
    this.callback("tree");
};
