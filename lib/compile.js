var winston = require('winston');
var async = require('async');
var path = require('path');
var spawn = require('child_process').spawn;
var cheerio = require('cheerio');
var fs = require('fs');

var EXTENSIONS = require('./clean').EXTENSIONS;

/** @funtion clean deletes the .aux and other files associated to the given tex file */
function clean( filename, callback )
{
    var filenames = EXTENSIONS.map( function(extension) {
	return filename.replace(/\..*/,'') + '.' + extension;
    });
    
    async.each( filenames, function( filename, callback ) {
	fs.access( filename, function (err) {
	    if (!err)
		fs.unlink( filename, callback );
	    else
		callback(null);
	});
    }, function(err) {
	if (err)
	    callback(err);
	else {
	    // winston.info("Deleted " + filenames.length + " intermediate files for " + filename);
	    callback(null);
	}
    });
}

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

    child.on('close', function (code, signal) {
	if ((code != 0) || (signal)) {
	    console.log( output.join() );	
	    
	    // BADBAD: Apparently I need to wait for i/o to finish...
	    setTimeout( function() {
		callback( command + " " + args.join(' ') + " failed (exit code " + code + "; signal " + signal + ")" );
	    }, 100);
	} else {
	    callback( null );
	}
    });    
}

/** @funtion pdflatex runs pdflatex (with the appropriate ximera options) on filename */
function pdflatex( filename, callback )
{
    var tikzexport = '"\\PassOptionsToClass{tikzexport}{ximera}\\PassOptionsToClass{xake}{ximera}\\PassOptionsToClass{xake}{xourse}\\nonstopmode\\input{' + path.basename(filename) + '}"';
    
    safeSpawn('pdflatex', ['-file-line-error', '-shell-escape', tikzexport],
	       { cwd: path.dirname(filename) },
	       callback );
}

/** @funtion htlatex runs htlatex (with the appropriate ximera options) on filename */
function htlatex( filename, callback ) {
    var htlatex  = safeSpawn('htlatex',
			     [path.basename(filename), "ximera,charset=utf-8,-css", " -cunihtf -utf8", "", "--interaction=nonstopmode -shell-escape -file-line-error"],
			     { cwd: path.dirname(filename) },
			     callback);	    
}

////////////////////////////////////////////////////////////////
// In principle, we might want to do some rearranging to the DOM before we finish "building"

function transformXourseFile( directory, filename, $, callback ) {
    // Remove the anchor links that htlatex is inserting
    $('a').each( function() {
	if ($(this).attr('id'))
	    $(this).remove();
    });
    
    // Normalize the activity links
    $('a.activity').each( function() {
        var href = $(this).attr('href');

        // BADBAD: do I need this?
        href = path.normalize( 
            path.join( path.dirname( filename ),
                       href )
        );

	// Unfortunately xourse files links are relative to repo root
	href = path.relative( directory, href );
	
        href = href.replace( /\.tex$/, '' );
        
        $(this).attr('href', href);
    });

    // BADBAD: need some assignment normalization, too
        
    var text = $.html();    
    fs.writeFile( filename, text, callback );
}

function transformActivityFile( directory, filename, $, callback ) {
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


function transformHtml( directory, filename, callback ) {
    fs.readFile(filename, function (err, data) {
	if (err)
	    callback(err);
	else {
	    var $ = cheerio.load( data );
	
	    if ($('meta[name="description"]').attr('content') == 'xourse') {
		// This is a "xourse" file which describes the global structure of a course
		transformXourseFile( directory, filename, $, callback );
	    } else {
		transformActivityFile( directory, filename, $, callback );
	    }
	}
    });
}

////////////////////////////////////////////////////////////////
module.exports.compile = function( directory, filename, callback ) {

    async.series([
	function(callback) {
	    clean( filename, callback );
	},	
	function(callback) {
	    pdflatex( filename, callback );
	},
	function(callback) {
	    // if sagetex file exists
	    var sagetex = path.join( path.dirname(filename),
				     path.basename(filename, '.tex') + '.sagetex.sage' );
	    fs.stat(sagetex, function(err, stat) {
		if(err == null) {
		    // sagetex file exists, so we need to run sage
		    safeSpawn('sage',
			      [path.basename(sagetex)],
			      { cwd: path.dirname(sagetex) },
			      callback);	   		    
		} else {
		    // file does not exist or is unreadable -- so no sage needed
		    callback(null);
		}
	    });
	},	
	function(callback) {
	    pdflatex( filename, callback );
	},
	function(callback) {
	    htlatex( filename, callback );
	},
	function(callback) {
	    transformHtml( directory, filename.replace(/\.tex$/, '.html' ), callback );
	},	
    ], function(err) {
	callback(err);
    });
}
