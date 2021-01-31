## Auditing User Permissions ##

The goal of this overview is to articulate a strategy for obtaining a list of repositories with the permissions of each collaborator 
who has access to that repository.  Note that in this context a collaborator is _any user_ who has access to a repository, including via:

 - outside collaborators
 - organization members that are direct collaborators
 - organization members with access through team memberships
 - organization members with access through default organization permissions
 - organization owners.

At a high level, we'll need to first retrieve a list of repositories, a list of users, and then
iterate through one list, checking permissions for each repository per user.  In pseudo-code:

```

var orgUsers = getOrgUsers();
var orgRepos = getOrgRepos();
var orgOutsideCollaborators = getOrgOutsideCollaborators();

var allUsers = orgUsers + orgOutsideCollaborators;

for each repo in orgRepos
 for each user in allUsers
   getPermissions(user, repo)
 next
next
```

### Relevant API endpoints ##

The complete list of users will be the union of organization members and outside collaborators.  

 - Organization members can be retrieved using the [members-list](https://developer.github.com/v3/orgs/members/#members-list) API endpoint.

 - Outside collaborators can be retrieved using the [outside collaborators](https://developer.github.com/v3/orgs/outside_collaborators/) endpoint.

 - The list of repos can be obtained using the [list organization repos](https://developer.github.com/v3/repos/#list-organization-repositories) endpoint.

 - The permissions for a given user vis-a-vis a given repo can be obtained via the [user permission level](https://developer.github.com/v3/repos/collaborators/#review-a-users-permission-level) endpoint.


### GraphQL Option ###

The REST v3 endpoints listed above function very well.  However, as is typical with REST APIs they're designed to return as much data as possible per call.  This is fine for individual calls,
but can lead to performance and rate limiting problems in scenarios where calls are being made iteratively.  

The [GitHub GraphQL API](https://developer.github.com/v4/) can help to avoid the problem.  In a nutshell, GraphQL allows you to define exactly which data you want returned in response to your API calls.  This means potentially reducing 
thousands of iterative calls to a REST endpoint to a single call to a GraphQL endpoint.  

For example, the following GraphQL query:

```json
query {
    organization(login:"github") {
        login
        name
        members(first:100) {
            edges {
                node {
                    login
                }
            }
        }
    }
}
```

Returns just the user information requested; the login (which is the GitHub UserID).

```json
{
  "data": {
    "organization": {
      "login": "github",
      "name": "GitHub",
      "members": {
        "edges": [
          {
            "node": {
              "login": "aragorn"
            }
          },
          {
            "node": {
              "login": "frodo"
            }
          },
          {
            "node": {
              "login": "gandalf"
            }
          },
          {
            "node": {
              "login": "sauron"
            }
          }
        ]
      }
    }
  }
}          
```

Consider exploring GraphQL if you run into performance and/or rate limiting problems using the v3 REST API.

