const Repo = require('./lib/repoController.js');
const HttpDispatcher = require('httpdispatcher');
const http = require('http');

try {
    initHTTPServer();
}
catch(err)
{
    console.log("Error starting server: " + err.message);
    process.exit(1);
}

function initHTTPServer() {
    var dispatcher = new HttpDispatcher();
    dispatcher.onPost('/createRepo', function(req,res)
    {
        var repo = new Repo();
        repo.executeRest(req,res,'create');
    });
    dispatcher.onPost('/getRepoConfig', function(req,res) {
        var repo = new Repo();
        repo.executeRest(req,res,'get');
    });
    dispatcher.onPost('/repoAudit',function(req,res){
        var repo = new Repo();
        repo.executeRest(req,res,'audit');
    })
    var server = http.createServer((request, response) => {
            try {
                response.respond = function(status,msg,err)
                {
                    var respText = {};
                    respText.msg = msg;
                    if (err && err.hasOwnProperty('message')) {
                        respText.error = err.message;
                    }
                    this.writeHead(status, {'Content-Type': 'application/json'});
                    this.end(JSON.stringify(respText));
                }; //response.respond
                dispatcher.dispatch(request, response);
                }
    catch (err)
        {
        if (err.message === 'SHUTDOWN')
        {
            throw err;
        }
        response.respond(503, "Error dispatching HTTP request",err);
    }
});

    // Startup the server
    server.listen(3000, () => {
        // Callback when server is successfully listening

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
    });
    })

};