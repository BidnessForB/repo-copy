var fs = require('fs');


var repo = JSON.parse(fs.readFileSync('./payloads/repo1.json'));
var key;

trimData(repo);

function trimData(data) {
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
}
