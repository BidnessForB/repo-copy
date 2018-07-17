/**
 * Created by bryancross on 7/17/18.
 */
module.exports = repoCreator;

var ghClient = require('@octokit/rest');
var http = require('http');
var HashMap = require('hashmap');

function repoCreator(ghPAT, templateRepo, newRepoOwner,newRepoName, tokens,caller) {

    this.newRepoOwner = newRepoOwner;
    this.newRepoName = newRepoName;
    this.tokens = tokens;
    this.templateRepo = templateRepo;
    this.funcList = new HashMap();
    this.funcList.set("repo", "repo");
    this.caller = caller;
    if(this.templateRepo.hasOwnProperty('teams')) {
        this.funcList.set("teams", "teams");
    }
    if(this.templateRepo.hasOwnProperty('users')) {
        this.funcList.set("users", "users");
    }
    if(this.templateRepo.hasOwnProperty('branches')) {
        this.funcList.set("branches", "branches");
    }
    if(this.templateRepo.hasOwnProperty('hooks')) {
        this.funcList.set("hooks", "hooks");
    }
    if(this.templateRepo.hasOwnProperty('tree')) {  //Gonna need to break this out into seperate tasks for each object
        this.funcList.set("tree", "tree");
    }
    for(var b = 0;b < templateRepo.branches.length;b++)
    {
        this.funcList.set(templateRepo.branches[b].name,templateRepo.branches[b].name);
    }
    this.newRepo = {
        repo: {},
        tree: {},
        users: [],
        teams: [],
        branches: [],
        hooks: [],
        errors: []
    };

    this.github = new ghClient({
        baseUrl: 'https://api.github.com'
        , headers: {'user-agent': 'repo-get'}
        , debug: true
    });

    this.github.authenticate({
        type: 'token',
        token: ghPAT
    });
};

repoCreator.prototype.execute = async function() {

    const repo = await this.createRepo();
    this.createBranches();
    this.createUsers();
    this.createTeams();
    this.createHooks();
    this.createTree();
};

repoCreator.prototype.createBranches = async function() {

    for(var i = 0; i < this.templateRepo.branches.length;i++)
    {
        var branch = this.templateRepo.branches[i];
        if(branch.name != 'master') {
            var newBranch = await
            this.github.gitdata.createReference({
                owner: this.newRepoOwner
                , repo: this.newRepoName
                , ref: 'refs/heads/' + branch.name
                , sha: newRepo.masterSHA
            });
        }
        if(branch.hasOwnProperty('protection'))
        {
            var protectionOptions = this.buildProtectionOptions(branch, this.newRepoOwner, this.newRepoName);
            var protection = this.github.repos.updateBranchProtection(protectionOptions);
        }
        else
        {
            this.callback(branch.name, branch);
        }
    }
};

repoCreator.prototype.getBranchProtection = async function(branch,owner,name, callback)
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

        this.callback(branch.name, branch.data);
    }
    catch(err)
    {
        if(JSON.parse(err).message == 'Branch not protected')
        {
            console.log("No protections for branch " + branch.name);
            this.callback(branch.name, branch);
        }
        else
        {
            this.callback(branch.name,null,err);
        }
    }
};

repoCreator.prototype.createUsers = async function() {

    var users = [];
    try {

        if (this.templateRepo.hasOwnProperty('users')) {
            for (var u = 0; u < this.templateRepo.users.length; u++) {
                var user = await //Do we need to wait here?  Maybe spin up functions for each user?
                this.github.repos.addCollaborator({
                    owner: this.newRepoOwner
                    , repo: this.newRepoName
                    , username: this.templateRepo.users[u].login
                    , permission: this.templateRepo.users[u].permission
                });
                users.push(user);
            }
        }
        this.callback("users", users);
    }
    catch(err)
    {
        this.callback('users',null,err);
    }
};

repoCreator.prototype.createTeams = async function() {

    var teams = [];
    try {
        if (this.templateRepo.hasOwnProperty('teams')) {
            for (var t = 0; t < templateRepo.teams.length; t++) {
                var team = await
                this.github.orgs.addTeamRepo({
                    team_id: templateRepo.teams[t].id
                    , owner: this.newRepoOwner
                    , repo: this.newRepoName
                    , permission: this.templateRepo.teams[t].permission
                });
                teams.push(team);
            }
        }
        this.callback("teams", teams);
    }
    catch(err) {
        this.callback("teams",null,err);
    }


};

repoCreator.prototype.createHooks = async function() {

    var hooks = [];
    try {

        if (templateRepo.hooks) {
            for (var hook = 0; hook < templateRepo.hooks.length; hook++) {
                var oldHook = templateRepo.hooks[hook];
                var newHook = await
                this.github.repos.createHook({
                    owner: newRepoOwner
                    , repo: newRepoName
                    , name: oldHook.name
                    , config: oldHook.config
                    , events: oldHook.events
                    , active: oldHook.active
                });
                hooks.push(hook);
            }
        }
        this.callback('hooks', hooks);
    }
    catch (err) {
        this.callback('hooks', null, err);
    }
    ;

repoCreator.prototype.createTree = function ()
{
    var contents = [];
        try {
       var masterSHA = await this.github.gitdata.getReference({
        owner: newRepoOwner
        ,repo: newRepoName
        ,ref: 'heads/master'
    });

        newRepo.masterSHA = masterSHA.data.object.sha;

        var content;
        var newContent;

        for(u = 0; u < this.templateRepo.tree.tree.length; u++) {
            content = await
            this.github.repos.getContent({
                owner: this.this.templateRepoOwner
                , repo: this.this.templateRepoName
                , path: this.templateRepo.tree.tree[u].path
                , ref: 'master'
            });

            if (this.templateRepo.tree.tree[u].path != 'README.md' && (this.templateRepo.tree.tree[u].type == 'file' || this.templateRepo.tree.tree[u].type == 'blob')) {
                newContent = await
                this.github.repos.createFile({
                    owner: newRepoOwner
                    ,repo: newRepoName
                    ,path: this.templateRepo.tree.tree[u].path
                    ,message: 'Content copied from ' + this.this.templateRepoName
                    ,content: this.transformContent(content.data.content,tokens, 'base64')
                    ,branch: 'master'
                });
                contents.push(newContent);
            }
            else if (this.templateRepo.tree.tree[u].path == 'README.md')
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
                    ,path: this.templateRepo.tree.tree[u].path
                    ,message: 'Content copied from ' + this.this.templateRepoName
                    ,content: this.transformContent(content.data.content, tokens, 'base64')
                    ,sha: newReadMe.data.sha
                    ,branch: 'master'
                });
                contents.push(newContent);
            }
        }
        this.callback('tree',contents);
    }
    catch(err)
    {
        this.callback('tree',null,err);
    }
};

repoCreator.prototype.transformContent = function(content, tokens, format)
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

repoCreator.prototype.callback = function(step,value,err){

        this.funcList.delete(step);
        if(value)
        {
            this.newRepo[step] = value;
        }
        else if(err)
        {
            this.newRepo.errors.push(err);
        }
        console.log("Finished " + step + " for " + this.name + " " + this.funcList.size);
        if(!this.funcList.size)
        {
            this.caller(this.name,this.trim(this.newRepo));
        }
    }
};

repoCreator.prototype.createRepo = async function()
{
    try {
        const repo = await
        this.github.repos.createForOrg({
            org: this.newRepoOwner
            ,name: this.newRepoName
            ,description: this.transformContent(templateRepo.repo.description, tokens, 'string')
            ,auto_init: true //create a readme, and by virtue of that, a master branch
        });
        repo.name = repo.data.name;
        repo.description = repo.data.description;
        repo.has_issues = repo.data.has_issues;
        repo.has_projects = repo.data.has_projects;
        repo.has_wiki = repo.data.has_wiki;
        repo.has_pages = repo.data.has_pages;
        repo.allow_squash_merge = repo.data.allow_squash_merge;
        repo.allow_merge_commit = repo.data.allow_merge_commit;
        repo.allow_rebase_merge = repo.data.allow_rebase_merge;
        repo.organization = {};
        repo.organization.login = repo.data.organization.login;
        this.callback("repo",repo);
    }
    catch(err)
    {
        this.callback("repo",repo,err);
    }
};
