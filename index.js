#!/usr/bin/env node;

const Repo = require('./lib/RepoController.js');
const HttpDispatcher = require('httpdispatcher');
const http = require('http');
const fs = require('fs');
const Markdown = require('markdown-to-html').GithubMarkdown;
var PORT = 3000;
try {
    if(process.argv[2] && typeof eval(process.argv[2]) === 'number' && process.argv[2] > 1024 && process.argv[2] < 65535)
    {
        PORT = process.argv[2];
    }
    initHTTPServer();
}
catch (err) {
    console.log("Error starting server: " + err.message);
    process.exit(1);
}

function initHTTPServer() {
    let dispatcher;
    let server;
    let homepage;
    dispatcher = new HttpDispatcher();
    dispatcher.onGet('/', function (req,res)
    {
        try{
            let md = new Markdown();

            let opts = {title:"Repo-copy",stylesheet:'web/repo-copy.css'};
            md.bufmax = 2048;
            md.once('end',function() {
                res.end();
            })
            md.render('./README.md',opts,function(err) {
                if(err){
					res.writeHead(200,{'Content-Type':'text/markdown'});
					res.end('## Error retrieving homepage ##');
					return;
                }
				md.pipe(res);
                return;
            });
        }
        catch(err)
        {
			res.writeHead(200,{'Content-Type':'text/markdown'});
			res.end('## Error retrieving homepage ##');
		}
    });
    dispatcher.onPost('/createRepo', function (req, res) {
        let repo;
        repo = new Repo();
        repo.executeRest(req, res, 'create');
    });
    dispatcher.onPost('/dump', function(req,res) {
        res.respond(200,'OK');
        let bod = JSON.parse(req.body);
        console.log(bod);
    })
    dispatcher.onPost('/getRepoConfig', function (req, res) {
        let repo;
        repo = new Repo();
        repo.executeRest(req, res, 'get');
    });
    dispatcher.onPost('/repoAudit', function (req, res) {
        let repo;
        repo = new Repo();
        repo.executeRest(req, res, 'audit');
    })
    server = http.createServer((request, response) => {
            try {
                response.respond = function (status, msg, err) {
                var respText = {};
                respText.msg = msg;
                if (err && err.hasOwnProperty('message')) {
                    respText.error = err.message;
                }
                this.writeHead(status, {'Content-Type': 'application/json'});
                this.end(JSON.stringify(respText));
                };
                dispatcher.dispatch(request, response);
            }
            catch (err)
            {
                if (err.message === 'SHUTDOWN') {
                    throw err;
                }
                response.respond(503, "Error dispatching HTTP request", err);
            }
            });
    // Startup the server.  If running on Heroku, use Heroku port, otherwise configured PORT


    server.listen(process.env.PORT || PORT, () => {
        console.log("Server listening on port " + (process.env.PORT || PORT));
    });


    // Cleanup after ourselves if we get nerve-pinched
    process.on('SIGTERM', function () {
        server.close(() => {
            self.shutdown();
            });
    });

    // Cleanup after ourselves if we get nerve-pinched
    process.on('SIGTERM', function () {
        server.close(() => {
            self.shutdown();
            console.log("Server shutdown successfully");
            });
    });
};

