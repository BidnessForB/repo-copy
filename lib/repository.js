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
    this.config.repoArgs.newRepo={repo:args.newRepoName,owner:args.ƒnewRepoOwner};
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


Repo.prototype.execute = async function(req,res,mode) {

    var repoData;
    var newRepoData;
    this.initRest(req,res);
    this.initGitHub();
    var body = JSON.parse(req.body);

    if(mode == 'get')
    {
        try {
            var owner = body.templateRepoURL.split('/')[3];
            var repo = body.templateRepoURL.split('/')[4];
        }
        catch(err)
        {
            this.respond(501,"Error parsing configuration",err);
            return;
        }
        repoData = await this.getRepoData(owner,repo);
        this.respond(201,repoData);
        return repoData;
    }
    else if(mode == 'create')
    {
        try {
            var owner = body.templateRepoURL.split('/')[3];
            var repo = body.templateRepoURL.split('/')[4];
        }
        catch(err)
        {
            this.respond(501,"Error parsing configuration",err);
            return;
        }
        var repoData = await this.getRepoData(owner,repo);
        newRepoData = await this.createRepo(repoData, body.newRepoName, body.newRepoOwner, body.tokens);
        this.respond(201,newRepoData);
        return newRepoData;
    }
    else if(mode == 'audit')
    {

        try {
            var repo1owner = body.repo1URL.split('/')[3];
            var repo1name = body.repo1URL.split('/')[4];
            var repo2owner = body.repo2URL.split('/')[3];
            var repo2name = body.repo2URL.split('/')[4];
        }
        catch(err)
        {
            this.respond(501,"Error parsing configuration",err);
            return;
        }
        var diffs = await this.compareRepos(repo1owner,repo1name,repo2owner,repo2name);
        this.respond(201,diffs);
        return diffs;
    }

};

Repo.prototype.getRepoData = async function (owner,name) {
    var repo;
    var teams;
    var users;
    var masterSHA;
    var masterTree;
    var branches;
    var protections;
    var hooks;
    var retval = {};
    var repoParams = {owner:owner,repo:name};
    var repo;


    
    try {

        repo = await this.github.repos.get(repoParams);
        retval.repo = {};
        retval.repo.name = repo.data.name;
        retval.repo.description = repo.data.description;
        retval.repo.has_issues = repo.data.has_issues;
        retval.repo.has_projects = repo.data.has_projects;
        retval.repo.has_wiki = repo.data.has_wiki;
        retval.repo.has_pages = repo.data.has_pages;
        retval.repo.allow_squash_merge = repo.data.allow_squash_merge;
        retval.repo.allow_merge_commit = repo.data.allow_merge_commit;
        retval.repo.allow_rebase_merge = repo.data.allow_rebase_merge;
        retval.repo.organization = {};
        retval.repo.organization.login = repo.data.organization.login;


        masterSHA = await this.github.gitdata.getReference({
            owner: repoParams.owner
            ,repo: repoParams.repo
            ,ref: 'heads/master'
        });

        masterTree = await this.github.gitdata.getTree({
            owner: repoParams.owner
            ,repo: repoParams.repo
            ,tree_sha: masterSHA.data.object.sha
            ,recursive:1
        });

        retval.tree = masterTree.data;

        teams = await this.github.repos.getTeams(repoParams);

        users = await this.github.repos.getCollaborators({
            owner:repoParams.owner
            ,repo:repoParams.repo
            ,affiliation:'all'  //this was misspelled.
        });

        retval.users = [];
        retval.teams = [];

        for(var u = 0;u < users.data.length;u++)
        {
            retval.users.push({login:users.data[u].login,permissions:users.data[u].permissions});
        }
        for(var t= 0;t < teams.data.length;t++)
        {
            retval.teams.push({name:teams.data[t].name,slug:teams.data[t].slug,permission:teams.data[t].permission, id:teams.data[t].id});
        }


        branches = await this.github.repos.getBranches(repoParams)
        branches = branches.data;
        //retval.branches = branches.data;
        retval.branches = [];
        for (var i = 0; i < branches.length;i++)
        {
            retval.branches.push({name:branches[i].name,sha:branches[i].commit.sha})
            try {
                protections = await
                this.github.repos.getBranchProtection({
                    owner: repoParams.owner,
                    repo: repoParams.repo,
                    branch: retval.branches[i].name
                });



                if(branches[i].hasOwnProperty('protection'))
                {
                    retval.branches[i].protection = {};
                    if(branches[i].protections.hasOwnProperty('required_status_checks'))
                    {
                        retval.branches[i].protections.required_status_checks = {}
                        retval.branches[i].protections.required_status_checks.strict = branches[i].protections.required_status_checks.strict;
                    }
                    if(branches[i].protections.hasOwnProperty('restrictions'))
                    {
                        retval.branches[i].protections.restrictions = {};
                        retval.branches[i].protections.restrictions = ({})
                    }
                }
                retval.branches[i].protection = protections.data;
                console.log("Protections " + i);
            }
            catch(err)
            {
                if(JSON.parse(err).message === 'Branch not protected')
                {
                    console.log("No protections for branch " + retval.branches[i].name);
                }
                else
                {
                    throw(err)
                }
            }
        }

        hooks = await this.github.repos.getHooks(repoParams);
        retval.hooks = hooks.data;
        return this.trimRepoData(retval);
    }
    catch(err)
    {
        throw(err)
    }

};

Repo.prototype.compareRepos = async function(repo1owner, repo1name, repo2owner, repo2name)
{
    var repo1 = await this.getRepoData(repo1owner,repo1name);
    var repo2 = await this.getRepoData(repo2owner,repo2name);
    var diffs = JCompare.compareJSON(repo1,repo2);
    return diffs;
};

Repo.prototype.createRepo = async function(templateRepo, newRepoName, newRepoOwner,tokens)
{


    this.repoData = templateRepo;
    var templateRepoName = templateRepo.repo.name;
    var templateRepoOwner = templateRepo.repo.organization.login;

    try {
        const repo = await this.github.repos.createForOrg({
            org: newRepoOwner
            ,name: newRepoName
            ,description: this.transformContent(this.repoData.repo.description,tokens, 'string')
            ,auto_init:true //create a readme, and by virtue of that, a master branch
        });

        this.repoData.newRepo.repo.name = repo.data.name;
        this.repoData.newRepo.repo.description = repo.data.description;
        this.repoData.newRepo.repo.has_issues = repo.data.has_issues;
        this.repoData.newRepo.repo.has_projects = repo.data.has_projects;
        this.repoData.newRepo.repo.has_wiki = repo.data.has_wiki;
        this.repoData.newRepo.repo.has_pages = repo.data.has_pages;
        this.repoData.newRepo.repo.allow_squash_merge = repo.data.allow_squash_merge;
        this.repoData.newRepo.repo.allow_merge_commit = repo.data.allow_merge_commit;
        this.repoData.newRepo.repo.allow_rebase_merge = repo.data.allow_rebase_merge;
        this.repoData.newRepo.repo.organization = {};
        this.repoData.newRepo.repo.organization.login = repo.data.organization.login;

        if(this.repoData.hasOwnProperty('teams'))
        {
            for(var t = 0; t < this.repoData.teams.length;t++)
            {
                var team = await this.github.orgs.addTeamRepo({
                    team_id:this.repoData.teams[t].id
                    ,owner:newRepoOwner
                    ,repo:newRepoName
                    ,permission:this.repoData.teams[t].permission
                });
            }
        }
        //Looks like team members are also listed in the output as collaborators.
        //Probably not the end of the world, but additional validation would fix this.
        if(this.repoData.hasOwnProperty('users'))
        {
            for(var u = 0; u < this.repoData.users.length; u++)
            {
                var user = await this.github.repos.addCollaborator({
                     owner:newRepoOwner
                    ,repo:newRepoName
                    ,username:this.repoData.users[u].login
                    ,permission:this.repoData.users[u].permission
                });
            }
        }

        var masterSHA = await this.github.gitdata.getReference({
            owner: newRepoOwner
            ,repo: newRepoName
            ,ref: 'heads/master'
        });

        this.repoData.newRepo.masterSHA = masterSHA.data.object.sha;

        var content;
        var newContent;

        for(u = 0; u < this.repoData.tree.tree.length; u++) {
            content = await
            this.github.repos.getContent({
                owner: templateRepoOwner
                , repo: templateRepoName
                , path: this.repoData.tree.tree[u].path
                , ref: 'master'
            });

            if (this.repoData.tree.tree[u].path != 'README.md' && (this.repoData.tree.tree[u].type == 'file' || this.repoData.tree.tree[u].type == 'blob')) {
                newContent = await
                this.github.repos.createFile({
                    owner: newRepoOwner
                    ,repo: newRepoName
                    ,path: this.repoData.tree.tree[u].path
                    ,message: 'Content copied from ' + templateRepoName
                    ,content: this.transformContent(content.data.content,tokens, 'base64')
                    ,branch: 'master'
                });
            }
            else if (this.repoData.tree.tree[u].path == 'README.md')
            {

                var newReadMe = await
                this.github.repos.getContent({
                    owner: newRepoOwner
                    , repo: newRepoName
                    , path: 'README.md'
                    , ref: 'master'
                });

                newContent = await
                this.github.repos.updateFile({
                    owner: newRepoOwner
                    ,repo: newRepoName
                    ,path: this.repoData.tree.tree[u].path
                    ,message: 'Content copied from ' + templateRepoName
                    ,content: this.transformContent(content.data.content, tokens, 'base64')
                    ,sha: newReadMe.data.sha
                    ,branch: 'master'
                });
            }
        }

        for(var i = 0; i < this.repoData.branches.length;i++)
        {
            var branch = this.repoData.branches[i];
            if(branch.name != 'master') {
                var newBranch = await
                this.github.gitdata.createReference({
                    owner: newRepoOwner
                    , repo: newRepoName
                    , ref: 'refs/heads/' + branch.name
                    , sha: this.repoData.newRepo.masterSHA
                });
            }
            if(branch.hasOwnProperty('protection'))
            {
                var protectionOptions = this.buildProtectionOptions(branch, newRepoOwner, newRepoName);
                var protection = await this.github.repos.updateBranchProtection(protectionOptions);
            }
        }
        this.repoData.hooks = [];
        if(templateRepo.hooks)
        {
            for(var hook = 0; hook < templateRepo.hooks.length;hook++)
            {
                var oldHook = templateRepo.hooks[hook];
                var newHook = await this.github.repos.createHook({
                owner:newRepoOwner
                ,repo: newRepoName
                ,name: oldHook.name
                ,config: oldHook.config
                ,events: oldHook.events
                ,active: oldHook.active
            });
                this.repoData.hooks.push(newHook);
            }
        }

        return this.trimRepoData(this.repoData.newRepo);

    }
    catch(err)
    {
        throw(err);
    }
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
    var templateProtection = branch.protection;
    var retval = {owner:owner
             ,repo:repo
             ,branch:branch.name
             ,required_status_checks: null
             ,required_pull_request_reviews: null
             ,restrictions:null
             ,enforce_admins:templateProtection.enforce_admins.enabled
    };

    if(templateProtection.hasOwnProperty('required_status_checks'))
    {
        retval.required_status_checks = {
            strict:templateProtection.required_status_checks.strict
            ,contexts:templateProtection.required_status_checks.contexts
        }
    }
    if(templateProtection.hasOwnProperty('restrictions'))
    {
        retval.restrictions = {};
        if(templateProtection.restrictions.hasOwnProperty('users'))
        {
            retval.restrictions.users = this.filterArray(templateProtection.restrictions.users,'login');
        }
        if(templateProtection.restrictions.hasOwnProperty('teams'))
        {
            retval.restrictions.teams = this.filterArray(templateProtection.restrictions.teams,'slug');
        }
    }

    if(templateProtection.hasOwnProperty('required_pull_request_reviews')) {
        retval.required_pull_request_reviews = {};
        retval.required_pull_request_reviews.dismiss_stale_reviews = templateProtection.required_pull_request_reviews.dismiss_stale_reviews;
        retval.required_pull_request_reviews.require_code_owner_reviews = templateProtection.required_pull_request_reviews.require_code_owner_reviews;
        if (templateProtection.required_pull_request_reviews.hasOwnProperty('dismissal_restrictions')) {
            retval.required_pull_request_reviews.dismissal_restrictions = {};
            retval.required_pull_request_reviews.dismissal_restrictions.users = this.filterArray(templateProtection.required_pull_request_reviews.dismissal_restrictions.users, 'login');
            retval.required_pull_request_reviews.dismissal_restrictions.teams = this.filterArray(templateProtection.required_pull_request_reviews.dismissal_restrictions.teams, 'slug');
        }
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
            }
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
    if(data.hasOwnProperty('hooks'))
    {
        for(var h = 0; h < data.hooks.length;h++)
        {
            var hook = data.hooks[h];
            delete hook.created_at;
            delete hook.id;
            delete hook.ping_url;
            delete hook.test_url;
            delete hook.updated_at;
            delete hook.url;
        }
    }
    return data;
};

