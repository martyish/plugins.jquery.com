var http = require( "http" ),
	fs = require( "fs" ),
	config = require( "../lib/config" ),
	service = require( "../lib/service" ),
	hook = require( "../lib/hook" ),
	logger = require( "../lib/logger" ),
	processing = {};

var port = (function() {
	var index = process.argv.indexOf( "-p" );
	return index === -1 ? 8001 : +process.argv[ index + 1 ];
})();

logger.log( "update-server started; listening on port " + port + "." );

process.on( "uncaughtException", function( error ) {
	logger.error( "Uncaught exception: " + error.stack );
});

var server = http.createServer(function( request, response ) {
	var data = "";
	request.setEncoding( "utf8" );
	request.on( "data", function( chunk ) {
		data += chunk;
	});

	request.on( "end", function() {
		if ( request.url === "/error.log" ) {
			return fs.createReadStream( config.errorLog ).pipe( response );
		}

		var repo = service.getRepoByHook( data );

		if ( !repo ) {
			// Invalid data, stop processing
			logger.error( "Invalid request: " + data );
			response.writeHead( 400 );
			response.end();
			return;
		}

		logger.log( "Received request: " + repo.id );

		// Accept the request and close the connection
		response.writeHead( 202 );
		response.end();

		// If we're already processing a request from this repo, skip the new
		// request. This prevents parallel processing of the same data which
		// could result in duplicate entries.
		if ( processing[ repo.id ] ) {
			logger.log( "Skipping parallel processing." );
			return;
		}

		// Process the request
		processing[ repo.id ] = true;
		hook.processHook( repo, function( error ) {
			delete processing[ repo.id ];
			logger.log( "Done processing request: " + repo.id );
			if ( error ) {
				logger.error( "Error processing hook: " + error.stack );
			}
		});
	});
});

// If another process is using this port, keep retrying
server.on( "error", function( error ) {
	if ( error.code === "EADDRINUSE" ) {
		return setTimeout(function() {
			// server.close();
			server.listen( port );
		}, 100 );
	}
});

server.listen( port );

function shutdownHook() {
	logger.log( "Shutting down update-server." );
	server.close();
}

process.once( "SIGINT", shutdownHook );
process.once( "SIGTERM", shutdownHook );
