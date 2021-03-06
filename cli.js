#!/usr/bin/env node;
/*jshint esversion: 6 */

"use strict";

/**
 * Created by bryancross on 7/13/18.
 */

const RepoController = require('./lib/RepoController');
const cla = require('command-line-args');
const clu = require('command-line-usage');


const optionDefinitions = [
    {name: 'templateRepoURL', alias: 't', type: String}
    , {name: 'targetRepoName', alias: 'n', type: String}
    , {name: 'targetRepoOwner', alias: 'o', type: String}
    , {name: 'mode', alias: 'm', type: String, defaultValue: 'get'}
    , {name: 'help', alias: 'h', type: Boolean}
    , {name: 'compareRepoURL', alias: 'c', type: String}
];

const clSections = [
    {
        header: 'repo-copy',
        content: 'A utility to retrieve configuration info for and/or copy a repository.'
    },
    {
        header: 'Options',
        optionList: [
            {
                name: 'templateURL',
                alias: 't',
                typeLabel: '{underline url}',
                description: 'URL for the repository to copy or retrieve configuration info for.'
            },
            {
                name: 'compareRepoURL',
                alias: 'c',
                typeLabel: '{underline url}',
                description: 'URL to compare templateRepoURL to'
            },
            {
                name: 'mode',
                alias: 'm',
                description: 'get|create|audit. \n get - return configuration data \n create - use configuration of <templateURL> to create a new repository\naudit - Return differences in configuration between template and target repos'
            },
            {
                name: 'targetRepoName',
                alias: 'n',
                description: 'Name of the repo to be created, or, in the case of <audit> mode, compared against'
            },
            {
                name: 'targetRepoOwner',
                alias: 'o',
                description: 'Owner of the repo to be created, or, in the case of <audit> mode, compared against'
            },
            {
                name: 'help',
                alias: 'h',
                type: Boolean,
                description: 'Display this message'
            }
        ]
    },
    {
        header: 'Examples',
        content: [
            {
                desc: '1. Retrieve repository configuration information',
                example: '$ node repo-copy -t https://github.com/myorg/myrepo'
            },
            {
                desc: '2. Create a new repository copying the configuration of a template repository',
                example: '$ node repo-copy -t https://github.com/myorg/myrepo -n myNewRepo -o myOtherOrg'
            },
            {
                desc: '3. Retrieve a list of configuration differences between 2 repositories',
                example: '$ node repo-copy -t https://github.com/sourceOrg/sourceRepo -n myCompareRepo -o myCompareOrg'
            }
        ]
    },
    {
        content: 'Project home: {underline https://github.com/bidnessforb/repo-copy}'
    }
];

const args = cla(optionDefinitions);

if (args.help) {
    console.log(clu(clSections));
    process.exit(0);
}

execute();


async function execute() { //jshint ignore:line

    var repo = new RepoController();
    var fakeRequest = {};
    var fakebody;

    try {
        //build a fake request

        if (args.mode === 'get') {
            fakebody = [{URL: args.templateRepoURL}];
        }
        else if (args.mode === 'audit') {
            fakebody = [{URL: args.templateRepoURL}, {URL: args.compareRepoURL}];
        }
        else if (args.mode === 'create') {
            fakebody = {
                templateRepoURL: args.templateRepoURL,
                newRepoOwner: args.targetRepoOwner,
                newRepoName: args.targetRepoName,
                tokens: []
            };
        }
        fakeRequest.body = JSON.stringify(fakebody);
        fakeRequest.headers = {};
        fakeRequest.headers.authorization = process.env.GH_PAT;
        repo.executeRest(fakeRequest, null, args.mode, function (data) {
            console.log(JSON.stringify(data));
            process.exit(0);
        });
    }
    catch (err) {
        console.log('Error: ' + err.message);
        process.exit(1);
    }

}

