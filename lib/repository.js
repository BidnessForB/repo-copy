#! /usr/bin/env node
/**
 * Created by bryancross on 12/27/16.
 *
 */

'use strict';

var ghClient = require('@octokit/rest');
var http = require('http');
var debug = require('debug');

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
    this.config.mode = args.mode;
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
    this.req = req;
    this.res = res;
    this.config = {};
    this.config.ghPAT = req.headers.authorization;


    this.initGitHub();

    var body = JSON.parse(req.body);
    this.config.tokens = body.tokens;
    this.config.mode = (body.mode ? body.mode : 'get');
    this.config.repoArgs = {}
    this.config.repoArgs.templateRepo = {repo:body.templateRepoURL.split('/')[4],owner:body.templateRepoURL.split('/')[3]};
    this.config.async = body.async;
    
    if(body.hasOwnProperty('newRepoName'))
    {
        this.config.repoArgs.newRepo = {name:body.newRepoName,owner:body.newRepoOwner};
    }
};


Repo.prototype.execute = async function() {

    if(this.config.async && this.res)
    {
        this.res.respond(200,"Repo creation initiated");
    }
    if(this.config.mode == 'get' || this.config.mode == 'create')
    {
        this.getRepoData(this.config.repoArgs.templateRepo);
    }

};

Repo.prototype.getRepoData = async function (repoParams) {
    var repo;
    var teams;
    var users;
    var masterSHA;
    var masterTree;
    var branches;
    var protections;
    var hooks;
    
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

        this.repoData.tree = masterTree.data;

        teams = await this.github.repos.getTeams(repoParams);

        users = await this.github.repos.getCollaborators({
            owner:repoParams.owner
            ,repo:repoParams.repo
            ,affiliiation:'all'
        });

        this.repoData.users = [];
        this.repoData.teams = [];

        for(var u = 0;u < users.data.length;u++)
        {
            this.repoData.users.push({login:users.data[u].login,permissions:users.data[u].permissions});
        }
        for(var t= 0;t < teams.data.length;t++)
        {
            this.repoData.teams.push({name:teams.data[t].name,slug:teams.data[t].slug,permission:teams.data[t].permission, id:teams.data[t].id});
        }


        branches = await this.github.repos.getBranches(repoParams)
        branches = branches.data;
        //this.repoData.branches = branches.data;
        this.repoData.branches = [];
        for (var i = 0; i < branches.length;i++)
        {
            this.repoData.branches.push({name:branches[i].name,sha:branches[i].commit.sha})
            try {
                protections = await
                this.github.repos.getBranchProtection({
                    owner: repoParams.owner,
                    repo: repoParams.repo,
                    branch: this.repoData.branches[i].name
                });



                if(branches[i].hasOwnProperty('protection'))
                {
                    this.repoData.branches[i].protection = {};
                    if(branches[i].protections.hasOwnProperty('required_status_checks'))
                    {
                        this.repoData.branches[i].protections.required_status_checks = {}
                        this.repoData.branches[i].protections.required_status_checks.strict = branches[i].protections.required_status_checks.strict;
                    }
                    if(branches[i].protections.hasOwnProperty('restrictions'))
                    {
                        this.repoData.branches[i].protections.restrictions = {};
                        this.repoData.branches[i].protections.restrictions = ({})
                    }
                }
                this.repoData.branches[i]
                this.repoData.branches[i].protection = protections.data;
                console.log("Protections " + i);
            }
            catch(err)
            {
                if(JSON.parse(err).message === 'Branch not protected')
                {
                    console.log("No protections for branch " + this.repoData.branches[i].name);
                    this.repoData.branches.push
                }
                else
                {
                    throw(err)
                }
            }
        }

        hooks = await this.github.repos.getHooks(repoParams);
        this.repoData.hooks = hooks.data;

        if(this.config.mode == 'get')
        {
            if(this.res)
            {
                this.respond(this.repoData,null,201);
            }
            console.log(this.repoData);
        }
        else if(this.config.mode == 'create')
        {
            this.createRepo();
        }
    }
    catch(err)
    {
        this.respond("Error retrieving repository configuration",err,501);
        return;
    }
};

Repo.prototype.createRepo = async function()
{
    try {
        const repo = await this.github.repos.createForOrg({
            org: this.config.repoArgs.newRepo.owner
            ,name: this.config.repoArgs.newRepo.name
            ,description: this.transformContent(this.repoData.repo.description, 'string')
            ,auto_init:true //create a readme, and by virtue of that, a master branch
        });

        this.repoData.newRepo = repo.data;

        if(this.repoData.hasOwnProperty('teams'))
        {
            for(var t = 0; t < this.repoData.teams.length;t++)
            {
                var team = await this.github.orgs.addTeamRepo({
                    team_id:this.repoData.teams[t].id
                    ,owner:this.config.repoArgs.newRepo.owner
                    ,repo:this.config.repoArgs.newRepo.name
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
                     owner:this.config.repoArgs.newRepo.owner
                    ,repo:this.config.repoArgs.newRepo.name
                    ,username:this.repoData.users[u].login
                    ,permission:this.repoData.users[u].permission
                });
            }
        }

        var masterSHA = await this.github.gitdata.getReference({
            owner: this.config.repoArgs.newRepo.owner
            ,repo: this.config.repoArgs.newRepo.name
            ,ref: 'heads/master'
        });

        this.repoData.newRepo.masterSHA = masterSHA.data.object.sha;

        var content;
        var newContent;

        for(u = 0; u < this.repoData.tree.tree.length; u++) {
            content = await
            this.github.repos.getContent({
                owner: this.config.repoArgs.templateRepo.owner
                , repo: this.config.repoArgs.templateRepo.repo
                , path: this.repoData.tree.tree[u].path
                , ref: 'master'
            });

            if (this.repoData.tree.tree[u].path != 'README.md' && (this.repoData.tree.tree[u].type == 'file' || this.repoData.tree.tree[u].type == 'blob')) {
                newContent = await
                this.github.repos.createFile({
                    owner: this.config.repoArgs.newRepo.owner
                    ,repo: this.config.repoArgs.newRepo.name
                    ,path: this.repoData.tree.tree[u].path
                    ,message: 'Content copied from ' + this.config.repoArgs.templateRepo.repo
                    ,content: this.transformContent(content.data.content, 'base64')
                    ,branch: 'master'
                });
            }
            else if (this.repoData.tree.tree[u].path == 'README.md')
            {

                var newReadMe = await
                this.github.repos.getContent({
                    owner: this.config.repoArgs.newRepo.owner
                    , repo: this.config.repoArgs.newRepo.name
                    , path: 'README.md'
                    , ref: 'master'
                });

                newContent = await
                this.github.repos.updateFile({
                    owner: this.config.repoArgs.newRepo.owner
                    ,repo: this.config.repoArgs.newRepo.name
                    ,path: this.repoData.tree.tree[u].path
                    ,message: 'Content copied from ' + this.config.repoArgs.templateRepo.repo
                    ,content: this.transformContent(content.data.content, 'base64')
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
                    owner: this.config.repoArgs.newRepo.owner
                    , repo: this.config.repoArgs.newRepo.name
                    , ref: 'refs/heads/' + branch.name
                    , sha: this.repoData.newRepo.masterSHA
                });
            }
            if(branch.hasOwnProperty('protection'))
            {
                var protectionOptions = this.buildProtectionOptions(branch, this.config.repoArgs.newRepo.owner, this.config.repoArgs.newRepo.name);
                var protection = await this.github.repos.updateBranchProtection(protectionOptions);
            }
        }


        if(!this.res)
        {
            console.log(this.repoData.newRepo);
            process.exit(0);
        }
        this.respond(this.repoData.newRepo,null, 201);
    }
    catch(err)
    {
        this.respond("Error: ", err,501);
    }
};

Repo.prototype.respond = function(msg, err, status)
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

Repo.prototype.transformContent = function(content, format)
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


    for(var  i = 0;i < this.config.tokens.length;i++)
    {
        strContent = strContent.replace('<' + this.config.tokens[i][0] + '>',this.config.tokens[i][1]);
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
