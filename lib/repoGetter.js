/**
 * Created by bryancross on 7/16/18.
 */


module.exports = repoGetter;

var ghClient = require('@octokit/rest');
var http = require('http');
var HashMap = require('hashmap');

function repoGetter(ghPAT) {

    this.funcList = new HashMap();
    this.funcList.set("repo", "repo");
    this.funcList.set("users", "users");
    this.funcList.set("teams", "teams");
    this.funcList.set("branches", "branches");
    this.funcList.set("hooks", "hooks");
    this.funcList.set("tree", "tree");
    this.funcList.set("labels","labels");
    this.repoData = {
        repo: {},
        tree: {},
        users: [],
        teams: [],
        branches: [],
        hooks: [],
        labels: [],
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

repoGetter.prototype.callback = function(step,value,err){


try {
    this.funcList.delete(step);
    if(value)
    {
        this.repoData[step] = value;
    }
    else if(err)
    {
        this.repoData.errors.push(err);
    }
    console.log("Finished " + step + " for " + this.name + " " + this.funcList.size);
    if(!this.funcList.size)
        {
            this.caller(this.name,this.trim(this.repoData));
        }
    }
    catch(err)
    {
        console.log(err);
    }
};

repoGetter.prototype.getLabels = async function(owner,name)
{
    try {
        var labels = await
        this.github.issues.getLabels({
            owner: owner
            , repo: name
        });

        if (labels.length == 0) {
            labels = [];
        }

        this.callback("labels", labels);
    }
    catch(err)
    {
        this.callback("labels",null,err);
    }
}

repoGetter.prototype.getRepoData = async function(owner,name)
{
    console.log("REPO DATA");
    var repo;
    var repoParams = {owner:owner,repo:name};
    var retval = {};

    try {

        repo = await this.github.repos.get(repoParams);
        retval.name = repo.data.name;
        retval.description = repo.data.description;
        retval.has_issues = repo.data.has_issues;
        retval.has_projects = repo.data.has_projects;
        retval.has_wiki = repo.data.has_wiki;
        retval.has_pages = repo.data.has_pages;
        retval.allow_squash_merge = repo.data.allow_squash_merge;
        retval.allow_merge_commit = repo.data.allow_merge_commit;
        retval.allow_rebase_merge = repo.data.allow_rebase_merge;
        retval.organization = {};
        retval.organization.login = repo.data.organization.login;

        this.callback("repo",retval);

    }
    catch(err)
    {
        this.callback("repo",null,err);
    }

};

repoGetter.prototype.getRepo = async function(repo, caller)
{
        this.owner = repo.owner;
        this.name = repo.name;
        this.caller = caller;
        this.start = new Date();
        this.getRepoData(this.owner,this.name);
        this.getUsers(this.owner,this.name);
        this.getTeams(this.owner,this.name);
        this.getBranches(this.owner,this.name);
        this.getTree(this.owner,this.name);
        this.getHooks(this.owner,this.name);
        this.getLabels(this.owner,this.name);
}

repoGetter.prototype.getUsers = async function getUsers(owner,name)
{
    try {
        console.log("USERS");
        var retval = [];
        var users = await
        this.github.repos.getCollaborators({
            owner: owner
            , repo: name
            , affiliation: 'all'  //this was misspelled.
        });

        for (var u = 0; u < users.data.length; u++) {
            retval.push({
                login: users.data[u].login,
                permissions: users.data[u].permissions
            });
        }

        this.callback( "users", retval);
    }
    catch(err)
    {
        this.callback("users",null,err);
    }

}
repoGetter.prototype.getBranchProtection = async function(branch,owner,name, callback) {
    try {
        var protections = await
        this.github.repos.getBranchProtection({
            owner: owner,
            repo: name,
            branch: branch.name
        });
        if (protections) {
            branch.protections = protections.data;
            if (protections.hasOwnProperty('required_status_checks')) {
                branch.protections.required_status_checks = {}
                branch.protections.required_status_checks.strict = branch.protections.required_status_checks.strict;
            }
        }

        this.callback( branch.name, null);
    }
    catch (err) {
        if (JSON.parse(err).message == 'Branch not protected') {
            console.log("No protections for branch " + branch.name);
            this.callback(branch.name);
        }
        else {
            this.callback( branch.name, null, err);
        }
    }
};



repoGetter.prototype.getBranches = async function(owner,name)
{
    try {
        console.log("BRANCHES");
        var repoParams = {owner: owner, repo: name};
        var retval = [];

        var branches = await
        this.github.repos.getBranches(repoParams)
        branches = branches.data;

        for (var i = 0; i < branches.length; i++) {
            retval.push({
                name: branches[i].name,
                sha: branches[i].commit.sha
            });
            this.funcList.set(retval[i].name, retval[i].name);
            this.getBranchProtection(retval[i], owner, name)
        }

        this.callback( "branches", retval);
    }
    catch(err)
    {
        this.callback("branches",null,err);
    }
};

repoGetter.prototype.getTeams = async function(owner,name)
{
    try {
        console.log("TEAMS");
        var repoParams = {owner: owner, repo: name};
        var teams = await
        this.github.repos.getTeams(repoParams);
        var retval = [];

        for (var t = 0; t < teams.data.length; t++) {
            retval.push({
                name: teams.data[t].name,
                slug: teams.data[t].slug,
                permission: teams.data[t].permission,
                id: teams.data[t].id
            });
        }

        this.callback( "teams", retval);
    }
    catch(err)
    {
        this.callback("teams",null,err);
    }
};

repoGetter.prototype.getHooks = async function(owner,name)
{
    try {

        console.log("HOOKS");
        var repoParams = {owner: owner, repo: name};

        retval = await
        this.github.repos.getHooks(repoParams);
        this.callback( "hooks", retval.data);
    }
    catch(err)
    {
        this.callback("hooks",null,err);
    }
};

repoGetter.prototype.getTree = async function(owner,name)
{
    try {

        console.log("TREE");
        var masterSHA = await
        this.github.gitdata.getReference({
            owner: owner
            , repo: name
            , ref: 'heads/master'
        });

        var masterTree = await
        this.github.gitdata.getTree({
            owner: owner
            , repo: name
            , tree_sha: masterSHA.data.object.sha
            , recursive: 1
        });


        this.callback( "tree", masterTree.data);
    }
    catch(err)
    {
        this.callback("tree",null,err);
    }
};

repoGetter.prototype.trim = function(data)
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
                    if (branch.hasOwnProperty('protections')) {
                        protection = branch.protections;
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
                }//for branch
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
                    delete hook.last_reponse;
                }
            }
        }
        catch(err)
        {
            console.log(err);
        }
        return data;
    };