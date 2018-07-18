/**
 * Created by bryancross on 7/17/18.
 */
module.exports = RepoCreator;

/*jshint esversion: 6 */


const ghClient = require('@octokit/rest');
const http = require('http');
const HashMap = require('hashmap');
const appDebug = require('debug')('RepoCreator:appDebug');
const appError = require('debug')('RepoCreator:appError');
const appOutput = require('debug')('RepoCreator:appOutput');


function RepoCreator(ghPAT, templateRepo, newRepoOwner,newRepoName, tokens,caller) {

    this.newRepoOwner = newRepoOwner;
    this.newRepoName = newRepoName;
    this.tokens = tokens;
    this.templateRepo = templateRepo;
    this.templateRepoName = templateRepo.repo.name;
    this.templateRepoOwner = templateRepo.repo.organization.login;
    this.taskList = new HashMap();
    this.taskList.set("repo", "repo");
    this.caller = caller;
    if(this.templateRepo.hasOwnProperty('teams')) {
        this.taskList.set("teams", "teams");
    }
    if(this.templateRepo.hasOwnProperty('labels')){
        this.taskList.set("labels","labels");
    }
    if(this.templateRepo.hasOwnProperty('users')) {
        this.taskList.set("users", "users");
    }
    if(this.templateRepo.hasOwnProperty('hooks')) {
        this.taskList.set("hooks", "hooks");
    }
    if(this.templateRepo.hasOwnProperty('topics')) {
        this.taskList.set("topics", "topics");
    }
    if(this.templateRepo.hasOwnProperty('tree')) {  //Gonna need to break this out into seperate tasks for each object
        this.taskList.set("tree", "tree");
    }
    for(var b = 0;b <this.templateRepo.branches.length;b++)
    {
        this.taskList.set(templateRepo.branches[b].name,templateRepo.branches[b].name);
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
        baseUrl: 'https://api.github.com',
        headers: {'user-agent': 'repo-get'},
        debug: true
    });

    this.github.authenticate({
        type: 'token',
        token: ghPAT
    });
};

RepoCreator.prototype.execute = async function() {

    let repo;
    let tree;
    let branches;


    repo = await this.createRepo();
    this.createUsers();
    this.createTeams();
    this.createHooks();
    this.createLabels();
    this.createTopics();
    tree = await this.createTree();
    branches = await this.createBranches();
};

RepoCreator.prototype.createBranches = async function()
{

    let branches = [];
    let newBranch;
    let protectionOptions;
    let protection;
    let branch;
    try {

        for (var i = 0; i < this.templateRepo.branches.length; i++) {
            try {
                branch = this.templateRepo.branches[i];
                if (branch.name != 'master') {
                    newBranch = await
                    this.github.gitdata.createReference({
                        owner: this.newRepoOwner
                        , repo: this.newRepoName
                        , ref: 'refs/heads/' + branch.name
                        , sha: this.masterSHA
                    });
                }
                if (branch.hasOwnProperty('protections')) {
                    protectionOptions = this.buildProtectionOptions(branch, this.newRepoOwner, this.newRepoName);
                    protection = await this.github.repos.updateBranchProtection(protectionOptions);
                }
                this.callback(branch.name, branch);
            }
            catch (err) {
                this.callback(branch.name, null, err);
            }
        }
    }
    catch(err)
        {
            this.callback("branches",null,err);
        }
}

RepoCreator.prototype.buildProtectionOptions = function(branch, owner,repo)
{
	let templateProtection = branch.protections;
	let retval = {
		owner: owner,
		repo: repo,
		branch: branch.name,
		required_status_checks: null,
		required_pull_request_reviews: null,
		restrictions: null,
		enforce_admins: templateProtection.enforce_admins.enabled,
	};

    try {


        if (templateProtection.hasOwnProperty('required_status_checks')) {
            retval.required_status_checks = {
                strict: templateProtection.required_status_checks.strict,
                contexts: templateProtection.required_status_checks.contexts
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
        appError(err);
    }
    return retval;
};

RepoCreator.prototype.createUsers = async function()
{

    let users = [];
    let user;
    try {

        if (this.templateRepo.hasOwnProperty('users')) {
            for (var u = 0; u < this.templateRepo.users.length; u++) {
                user = await //Do we need to wait here?  Maybe spin up functions for each user?
                this.github.repos.addCollaborator({
                    owner: this.newRepoOwner,
                    repo: this.newRepoName,
                    username: this.templateRepo.users[u].login,
                    permission: this.templateRepo.users[u].permission,
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

RepoCreator.prototype.createTeams = async function()
{

    var teams = [];
    try {
        if (this.templateRepo.hasOwnProperty('teams')) {
            for (var t = 0; t < this.templateRepo.teams.length; t++) {
                var team = await
                this.github.orgs.addTeamRepo({
                    team_id: this.templateRepo.teams[t].id
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

RepoCreator.prototype.createHooks = async function()
{

    var hooks = [];
    try {

        if (this.templateRepo.hooks) {
            for (var hook = 0; hook < this.templateRepo.hooks.length; hook++) {
                var oldHook = this.templateRepo.hooks[hook];
                var newHook = await
                this.github.repos.createHook({
                    owner: this.newRepoOwner,
                    repo: this.newRepoName,
                    name: oldHook.name,
                    config: oldHook.config,
                    events: oldHook.events,
                    active: oldHook.active
                });
                hooks.push(newHook);
            }
        }
        this.callback('hooks', hooks);
    }
    catch (err) {
        this.callback('hooks', null, err);
    }
};

RepoCreator.prototype.createLabels = async function()
{
    let labels = [];
    let label;
    let newLabel;
    try {
        if (!this.templateRepo.hasOwnProperty('labels')) {
            this.callback('labels', {labels: []});
            return;
        }
        for (var l = 0; l < this.templateRepo.labels.length; l++) {
            label = this.templateRepo.labels[l];
            newLabel = await this.github.issues.createLabel({
                owner: this.newRepoOwner,
                repo: this.newRepoName,
                name: label.name,
                color: label.color,
                description: label.description
            });
            labels.push(newLabel);
        }

        this.callback('labels', labels);
    }
    catch(err)
    {
        this.callback('labels',null,err);
    }
};

RepoCreator.prototype.createTopics = async function()
{
    let topics = [];
    let topic;
    let newTopic;

    try {
        if (!this.templateRepo.hasOwnProperty('topics')) {
            this.callback('topics', {topics: []});
            return;
        }
        for (var l = 0; l < this.templateRepo.topics.length; l++) {
            topic = this.templateRepo.topics[l];
            newTopic = await this.github.issues.createTopic({
                owner: this.newRepoOwner
                , repo: this.newRepoName
                , name: topic.name
                , color: topic.color
                , description: topic.description
            });
            topics.push(newTopic);
        }
        this.callback('topics', topics);
    }
    catch(err)
    {
        this.callback('topics',null,err);
    }
};

RepoCreator.prototype.createTree = async function ()
{
    let srcContent;
    let newContent;
    let newContents = [];
    let newReadMe;
    try {
        for(u = 0; u < this.templateRepo.tree.tree.length; u++) {
            srcContent = await
            this.github.repos.getContent({
                                owner: this.templateRepoOwner,
                                repo: this.templateRepoName,
                                path: this.templateRepo.tree.tree[u].path,
                                ref: 'master'
                            });

            if (this.templateRepo.tree.tree[u].path !== 'README.md' && (this.templateRepo.tree.tree[u].type === 'file' || this.templateRepo.tree.tree[u].type === 'blob')) {
                newContent = await this.github.repos.createFile({
                                                        owner: this.newRepoOwner
                                                        ,repo: this.newRepoName
                                                        ,path: this.templateRepo.tree.tree[u].path
                                                        ,message: 'Content copied from ' + this.templateRepoName
                                                        ,content: this.transformContent(srcContent.data.content,this.tokens, 'base64')
                                                        ,branch: 'master'
                                                    });
                newContents.push(newContent);
            }
            else if (this.templateRepo.tree.tree[u].path === 'README.md')
            {
                newReadMe = await this.github.repos.getContent({
                                                    owner: this.newRepoOwner,
                                                    repo: this.newRepoName,
                                                    path: 'README.md',
                                                    ref: 'master'
                                                });

                newContent = await this.github.repos.updateFile({
                                                        owner: this.newRepoOwner,
                                                        repo: this.newRepoName,
                                                        path: this.templateRepo.tree.tree[u].path,
                                                        message: 'Content copied from ' + this.templateRepoName,
                                                        content: this.transformContent(srcContent.data.content, this.tokens, 'base64'),
                                                        sha: newReadMe.data.sha,
                                                        branch: 'master'
                                                    });
                newContents.push(newContent);
            }
        }
        this.callback('tree',newContents);
    }
    catch(err)
    {
        this.callback('tree',null,err);
    }
};

RepoCreator.prototype.transformContent = function(content, tokens, format)
{
    let strContent;
    if(!tokens)
    {
        return content;
    }
    if(format && format === 'string')
    {
        strContent = content;
    }
    else if (format && format === 'base64')
    {
        strContent = Buffer.from(content, 'base64').toString();
    }

    for(var  i = 0;i < tokens.length;i++)
    {
        strContent = strContent.replace('<' + tokens[i][0] + '>', tokens[i][1]);
    }
    if(format && format === 'base64')
    {
        return Buffer.from(strContent).toString('base64');
    }
    else if (format && format === 'string')
    {
        return strContent;
    }
};

RepoCreator.prototype.callback = function(step,value,err)
{

        let strTasksRemaining;

        this.taskList.delete(step);
        appDebug("Finished creating " + step + " for " + this.newRepoOwner + "/" + this.newRepoName);
        strTasksRemaining = "Remaining keys: \n";
        for(var key = 0; key < this.taskList.keys().length; key++)
    {
        strTasksRemaining = strTasksRemaining + "\t\t" + this.taskList.keys()[key];
        appDebug(strTasksRemaining);
    }
        if(value)
        {
            this.newRepo[step] = value;
        }
        else if(err)
        {
            this.newRepo.errors.push(err);
        }
        appDebug("Finished " + step + " for " + this.name + " " + this.taskList.size);
        if(!this.taskList.size)
        {
            this.caller(this.name,this.newRepo);
        }
};

RepoCreator.prototype.createRepo = async function()
{
    let repo;
    try {
        repo = await
        this.github.repos.createForOrg({
            org: this.newRepoOwner
            ,name: this.newRepoName
            ,description: this.transformContent(this.templateRepo.repo.description, this.tokens, 'string')
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
        this.callback("repo",null,err);
    }
};

RepoCreator.prototype.filterArray = function (arr,propname)
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