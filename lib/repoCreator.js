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
    this.templateRepoName = templateRepo.repo.name;
    this.templateRepoOwner = templateRepo.repo.organization.login;
    this.funcList = new HashMap();
    this.funcList.set("repo", "repo");
    this.caller = caller;
    if(this.templateRepo.hasOwnProperty('teams')) {
        this.funcList.set("teams", "teams");
    }
    if(this.templateRepo.hasOwnProperty('users')) {
        this.funcList.set("users", "users");
    }
    /*if(this.templateRepo.hasOwnProperty('branches')) {
        this.funcList.set("branches", "branches");
    }
    */
    if(this.templateRepo.hasOwnProperty('hooks')) {
        this.funcList.set("hooks", "hooks");
    }
    if(this.templateRepo.hasOwnProperty('tree')) {  //Gonna need to break this out into seperate tasks for each object
        this.funcList.set("tree", "tree");
    }
    for(var b = 0;b <this.templateRepo.branches.length;b++)
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
    this.createUsers();
    this.createTeams();
    this.createHooks();
    const tree = await this.createTree();
    const branches = await this.createBranches();
};

repoCreator.prototype.createBranches = async function()
{

    var branches = [];
    try {

        for (var i = 0; i < this.templateRepo.branches.length; i++) {
            try {
                var branch = this.templateRepo.branches[i];
                if (branch.name != 'master') {
                    var newBranch = await
                    this.github.gitdata.createReference({
                        owner: this.newRepoOwner
                        , repo: this.newRepoName
                        , ref: 'refs/heads/' + branch.name
                        , sha: this.masterSHA
                    });
                }
                if (branch.hasOwnProperty('protections')) {
                    var protectionOptions = this.buildProtectionOptions(branch, this.newRepoOwner, this.newRepoName);
                    var protection = await this.github.repos.updateBranchProtection(protectionOptions);
                }
                this.callback(branch.name, branch);

            }
            catch (err) {
                this.callback(branch.name, null, err);
            }
        }
        this.callback('branches',)
    }
    catch(err)
        {
            this.callback("branches",null,err);
        }
};

repoCreator.prototype.buildProtectionOptions = function(branch, owner,repo)
{
    try {
        var templateProtection = branch.protections;
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

repoCreator.prototype.createUsers = async function()
{

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

repoCreator.prototype.createTeams = async function()
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

repoCreator.prototype.createHooks = async function()
{

    var hooks = [];
    try {

        if (this.templateRepo.hooks) {
            for (var hook = 0; hook < this.templateRepo.hooks.length; hook++) {
                var oldHook = this.templateRepo.hooks[hook];
                var newHook = await
                this.github.repos.createHook({
                    owner: this.newRepoOwner
                    , repo: this.newRepoName
                    , name: oldHook.name
                    , config: oldHook.config
                    , events: oldHook.events
                    , active: oldHook.active
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

/*repoCreator.prototype.createTree = async function ()
{
        var srcContent;
        var srcBlobs = [];
        var newContent;
        var newBlobs = [];

    var masterSHA = await
    this.github.gitdata.getReference({
        owner: this.newRepoOwner
        , repo: this.newRepoName
        , ref: 'heads/master'
    });

    this.masterSHA = masterSHA.data.object.sha;

    try {
        for(u = 0; u < this.templateRepo.tree.tree.length; u++) {

            srcContent = await
            this.github.repos.getContent({
                owner: this.templateRepoOwner
                , repo: this.templateRepoName
                , path: this.templateRepo.tree.tree[u].path
                , ref: 'master'
            });
            if(this.templateRepo.tree.tree[u].path == 'README.md')
            {
                srcContent.data.content = this.transformContent(srcContent.data.content,this.tokens,'base64');
            }
            var newBlob = await this.github.gitdata.createBlob({
                owner: this.newRepoOwner
                ,repo: this.newRepoName
                ,content: srcContent.data.content
                ,encoding: 'base64'
            });
            newBlob = newBlob.data;
            newBlob.path = this.templateRepo.tree.tree[u].path;
            newBlob.mode = (srcContent.data.type == 'file' ? "100644" : "040000");
            newBlob.type = "blob"
            delete newBlob.url;
            newBlob.content = srcContent.data.content;
            newBlobs.push(newBlob);
        }

        var newTreeOptions = {owner:this.newRepoOwner
            ,repo:this.newRepoName
            ,base_tree:this.masterSHA
            ,tree:newBlobs};
        var newTree = await this.github.gitdata.createTree(
            newTreeOptions
        );
        var newCommit = this.github.gitdata.createCommit({
            owner:this.newRepoOwner
            ,repo:this.newRepoName
            ,message:'Committed by repo-copy'
            ,tree:newTree.data.sha
            ,parents:[this.masterSHA]
        });
        this.callback('tree',newTree);
    }
    catch(err)
    {
        this.callback('tree',null,err);
    }
};
*/

repoCreator.prototype.createTree = async function ()
{
    var srcContent;
    var srcBlobs = [];
    var newContent;
    var newContents = [];
    try {
        for(u = 0; u < this.templateRepo.tree.tree.length; u++) {
            srcContent = await
            this.github.repos.getContent({
                owner: this.templateRepoOwner
                , repo: this.templateRepoName
                , path: this.templateRepo.tree.tree[u].path
                , ref: 'master'
            });



            if (this.templateRepo.tree.tree[u].path != 'README.md' && (this.templateRepo.tree.tree[u].type == 'file' || this.templateRepo.tree.tree[u].type == 'blob')) {
                newContent = await
                this.github.repos.createFile({
                    owner: this.newRepoOwner
                    ,repo: this.newRepoName
                    ,path: this.templateRepo.tree.tree[u].path
                    ,message: 'Content copied from ' + this.templateRepoName
                    ,content: this.transformContent(srcContent.data.content,this.tokens, 'base64')
                    ,branch: 'master'
                });
                newContents.push(newContent);
            }
            else if (this.templateRepo.tree.tree[u].path == 'README.md')
            {

                var newReadMe = await
                this.github.repos.getContent({
                    owner: this.newRepoOwner
                    , repo: this.newRepoName
                    , path: 'README.md'
                    , ref: 'master'
                });

                newContent = await
                this.github.repos.updateFile({
                    owner: this.newRepoOwner
                    ,repo: this.newRepoName
                    ,path: this.templateRepo.tree.tree[u].path
                    ,message: 'Content copied from ' + this.templateRepoName
                    ,content: this.transformContent(srcContent.data.content, this.tokens, 'base64')
                    ,sha: newReadMe.data.sha
                    ,branch: 'master'
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

repoCreator.prototype.callback = function(step,value,err)
{

        this.funcList.delete(step);
        console.log("Finished creating " + step + " for " + this.newRepoOwner + "/" + this.newRepoName);
        var cs = "Remaining keys: \n";
        for(var key = 0;key < this.funcList.keys().length;key++)
    {
        cs = cs + "\t\t" + this.funcList.keys()[key];
        console.log(cs);

    }
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
            this.caller(this.name,this.newRepo);
        }
};

repoCreator.prototype.createRepo = async function()
{
    try {
        const repo = await
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
        return;
    }
    catch(err)
    {
        this.callback("repo",null,err);
    }
};

repoCreator.prototype.filterArray = function (arr,propname)
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