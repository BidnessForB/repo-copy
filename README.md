# repo-copy

on [GitHub](https://github.com/bidnessforb/repo-copy)

Utility program which:
1. Retrieves complete repository configuration for one or more repos.
1. Compares and returns differences in configuration between 2 repos.
1. Creates a new repository, copying the configuration and content of a template repository

The application can be run as a REST service or a command line application.

### Try it out on Heroku ###
Repo-copy is running on Heroku:

[https://still-shelf-20156.herokuapp.com](https://still-shelf-20156.herokuapp.com)

### Getting Started

1. Clone the [repo-copy repo](https://github.com/bidnessforb/repo-copy)
1. Run `npm install`
1. Run the server or the command line application with appropriate parameters (see below)
1. If using the command line interface, set an environment variable called GH_PAT equal to your properly scoped 
 GitHub Personal Access Token (PAT).
 
`$ export GH_PAT=<your token>`

### Logging/Debugging

Repo-copy uses the [DEBUG](https://www.npmjs.com/package/debug) library.  There are three scopes;  `` each with 3 sub-scopes.  
Just set the DEBUG environment variable to include the scopes for which you want logging/debugging info.
  
  |Scope | Description | 
  |-----|-----|
  |Repo|The server, `index.js`|
  |repoCreator|The module that handles creating repos, `repoCreator.js`|
  |repoGetter | The module that handles retrieving repo configuration info, `repoGetter.js`|
  
  
The three sub-scopes are:
  
  |Sub-Scope|Description|
  |-----|-----|
  |appDebug|Debugging output|
  |appError|Error output|
  |appOutput|Command output, generally should leave this on|
  
For example, to enable just application output:
  `DEBUG=Repo:appOutput`
  
To add debugging info from `repoGetter.js`:
  `DEBUG=Repo:appOutput,repoGetter:appDebug`

To add everything:
  `DEBUG=*`

### Running as a server 

To start the server:
1. `cd` to the repo-copy project directory.
1. Run `start-server`
 
`start-server` takes an optional parameter, PORT.  Otherwise the server will listen
on the default port, 3000.

__NOTE:__ `package.json` includes the appropriate entries in the `bin` section that should install
the `start-server` command on your machine after you run `npm install`.  Unfortunately it doesn't work
reliably in my environment, probably due to node configuration wierdness.  So if the native command doesn't work,
just use node:

`node createRepocontroller.js <port>`

See [REST API](#REST-API) for information on making REST calls to the server.

#### Authorization ####
Use the `Authorization` header with your GitHub PAT to authenticate to GitHub. 

### Running on the command line
Assuming `npm install` worked as advertised, you can run repo-copy on the command line
using the `repo-copy` command.  If not, run the shim using node:

`node cli.js <args>`

#### Arguments ####
Arguments will vary depending on the _mode_ you're using.  

|Alias|Name|type|values|Desc|
|-----|----|----|------|----|
| `-t`  |`--templateURL`  |url|      |URL for the repository to copy or retrieve configuration info for.    |
| `-c`  |`--compareRepoURL`|url|     |URL to compare to `templateURL`  |
| `-m`  |`--mode`|string|`get`,`audit`,`create`|`get` - return configuration data<br>`create` - use configuration of `templateURL` to create a new repository<br>`audit` - Return configuration differences between the `templateURL` and `compareRepoURL`    |
| `-n`   |`--targetRepoName`    |String    |      |`mode=create` only. Name of the repo to be created    |
| `-o`   |`--targetRepoOwner`    |String    |      |`mode=create` only. Owner (org) of the repo to be created    |
|`-h`  |`--help`    |    |      | Display help   |
|`-k`  |`--tokens`    |array  |      |`mode=create` only. List of key/value pairs, used to substitute values for tokens in template repository content copied into a new repository.  __NOTE:__Not implemented for CI  |

__NOTE:__Tokens are not yet supported on the command line.  
 
Examples

1. Retrieve repository configuration information 

`$ node cli.js -m get -t https://github.com/myorg/myrepo`                           
  
2. Create a new repository copying the configuration of a template repository   

`$ node cli.js -m create -t https://github.com/myorg/myrepo -n myNewRepo -o myOtherOrg`           

3. Retrieve a list of configuration differences between 2 repositories          

`$ node cli.js -m audit -t https://github.com/sourceOrg/sourceRepo -n myCompareRepo -o myCompareOrg`                                 

### REST API ###

There are three endpoints in the `repo-copy` REST API:

1. `POST /getRepoConfig`     - Return configuration for one ore more repositories.
2. `POST /repoAudit`         - Return configuration differences between two repositories.
3. `POST /createRepo`        - Create a new repository based on the configuration of a template repository

#### REST: getRepoConfig ####

The `getRepoConfig` endpoint takes an array of one or more URLs
`[`
  `{"URL":"https://github.com/someorg/somerepo"}`
  `{"URL":"https://github.com/anotherorg/anotherrepo"}`
 `]`
 
The response contains a JSON model of the repositories configuration.  This is much more complete than that
 available using either the GitHub v3 or v4 APIs.  Currently the configuration returned contains the following elements
 
 |Element|Desc|
 |----|----|
 |`repo`|General repository information|
 |`tree`|The content tree of the repository (`/refs/head/master`)|
 |`users`|Users assigned access to the repository, and their permissions|
 |`teams`|Teams assigned permissions in the repository|
 |`branches`|Repository branches, with protection configuration|
 |`hooks`|Repository webhooks|
 |`labels`|Repository labels|
 |`topics`|Topics assigned to the repository|
 |`errors`|Non-fatal errors which occurred during configuration retrieval|
 
 #### REST: repoAudit ####
 
 The `repoAudit` endpoint takes an array of two URLs.  The first is the template repository,
 the second is the comparison repository.
 
 `[`
   `{"URL":"https://github.com/someorg/somerepo"}`
   `{"URL":"https://github.com/anotherorg/anotherrepo"}`
  `]`
  
  The response returns an array containing the elements in the JSON configuration which differ,
  as well as a description of the differences.  Differences are generated by [deep-diff](https://www.npmjs.com/package/deep-diff)
  which can detect changes in both data and structure.
  
  ```javascript
  "msg": {
          "diffs": [
              {
                  "type": "Different values",
                  "path": "repo/name/"
              },
              {
                  "type": "Different values",
                  "path": "repo/description/"
              },
              {
                  "type": "Array change",
                  "path": "tree/tree/"
              },
              {
                  "type": "Array change",
                  "path": "tree/tree/"
              },
              {
                  "type": "Array change",
                  "path": "tree/tree/"
              }
```   
#### REST: createRepo ####

The `createRepo` endpoint creates a new repository with the same configuration and content as the specified 
template repository.  If the optional `tokens` argument is supplied, all matching tokens in content in the template repository will
 be replaced by their corresponding values before being copied into the new repository.  The token format to use in template content is `<token>`.
 
```javascript
{
	 "templateRepoURL":"https://github.com/myorg/myrepo"
	,"newRepoOwner":"anotherorg"
	,"newRepoName":"NewRepo"
	,"tokens": [
    ["customer", "My Customer"],
    ["PRP", "Bryan Cross"],
    ["PRPEmail", "bryancross@github.com"],
    ["PRPGitHubID", "@bryancross"],
    ["CustomerLogoURL", "https://www.foo.com/someimage.jpg"]
    ]
}
```
           