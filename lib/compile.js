var winston = require('winston');
var async = require('async');
var path = require('path');
var spawn = require('child_process').spawn;
var cheerio = require('cheerio');
var fs = require('fs');

/** @function safeSpawn spawns 'command args' (with options) via
 * child_process, and captures the output -- only dumping it via
 * winston if the spawned process fails with a nonzero exit code */
function safeSpawn( command, args, options, callback ) {
    winston.debug( "Spawning: " + command + " " + args.join(' ') );
    var child  = spawn(command, args, options);
    
    var output = [];

    child.stdout.setEncoding('utf8');
    
    child.stdout.on('data', function (data) {
	output.push( data );
    });

    child.on('close', function (code) {
	if (code != 0) {
	    console.log( output.join() );	
	    
	    // BADBAD: Apparently I need to wait for i/o to finish...
	    setInterval( function() {
		callback( command + " " + args.join(' ') + " failed (exit code " + code + ")" );
	    }, 100);
	} else {
	    callback( null );
	}
    });    
}

/** @funtion pdflatex runs pdflatex (with the appropriate ximera options) on filename */
function pdflatex( filename, callback )
{
    var tikzexport = '"\\PassOptionsToClass{tikzexport}{ximera}\\nonstopmode\\input{' + path.basename(filename) + '}"';
    
    safeSpawn('pdflatex', ['-file-line-error', '-shell-escape', tikzexport],
	       { cwd: path.dirname(filename) },
	       callback );
}

/** @funtion htlatex runs htlatex (with the appropriate ximera options) on filename */
function htlatex( filename, callback ) {
    var htlatex  = safeSpawn('htlatex',
			     [path.basename(filename), "ximera,charset=utf-8,-css", "", "", "--interaction=nonstopmode -shell-escape -file-line-error"],
			     { cwd: path.dirname(filename) },
			     callback);	    
}

////////////////////////////////////////////////////////////////
// In principle, we might want to do some rearranging to the DOM before we finish "building"

function transformXourseFile(  filename, $, callback ) {
    // Normalize the activity links
    $('a.activity').each( function() {
	var href = $(this).attr('href');

	// BADBAD: do I need this?
	/*href = path.normalize( 
	  path.join( path.dirname( root ), href )
	);*/
	
	href = href.replace( /\.tex$/, '' );
	
	$(this).attr('href', href);
    });					 
    
    var text = $.html();    
    fs.writeFile( filename, text, callback );
}

function transformActivityFile( filename, $, callback ) {
    callback(null);
}

    /*
					 // Extract everything between body tags
					 text = cheerio.load( text )('body').html();

					 if (text) {
					     saveToContentAddressableFilesystem( text, function(err, hash) {
						 var activity = new mdb.Activity();
						 
						 // Find all the learning outcomes mentioned in the <head>'s meta tags
						 var outcomes = [];
						 
						 $('meta[name="learning-outcome"]').each( function() {
						     var learningOutcome = $(this).attr('content');
						     
						     var outcome = new mdb.Outcome();
						     outcome.name = learningOutcome;
						     outcome.hash = hash;
						     
						     outcome.save( function() {
							 winston.info( "Associated " + filename + " with outcome: " + learningOutcome );
						     });
						     
						     outcomes.push( learningOutcome );
						 });
						 
						 // Save the HTML file to the database as an activity
						 activity.commit = headCommit.sha();
						 activity.hash = hash;
						 activity.path = filename.replace( /.html$/, "" );
						 activity.title = title;
						 activity.outcomes = outcomes;
						 
						 activity.save(callback);
    
*/


function transformHtml( filename, callback ) {
    fs.readFile(filename, function (err, data) {
	if (err)
	    callback(err);
	else {
	    var $ = cheerio.load( data );
	
	    if ($('meta[name="description"]').attr('content') == 'xourse') {
		// This is a "xourse" file which describes the global structure of a course
		transformXourseFile( filename, $, callback );
	    } else {
		transformActivityFile( filename, $, callback );
	    }
	}
    });
}

////////////////////////////////////////////////////////////////
module.exports.compile = function( directory, filename, callback ) {
    async.series([
	function(callback) {
	    pdflatex( filename, callback );
	},
	function(callback) {
	    htlatex( filename, callback );
	},
	function(callback) {
	    transformHtml( filename.replace(/\.tex$/, '.html' ), callback );
	},	
    ], function(err) {
	callback(err);
    });
}
