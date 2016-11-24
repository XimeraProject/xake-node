var winston = require('winston');
var async = require('async');
var path = require('path');
var cheerio = require('cheerio');
var fs = require('fs');

function report( filename, line, level, error ) {
    var text = filename + ":";

    if (line > 0)
	text = text + line.toString() + ":";

    text = text + " " + error;
    
    if (level == "warning")
	winston.warn( text );
    else if (level == "error")
	winston.error( text );
    else winston.info( text );
}

////////////////////////////////////////////////////////////////
function checkMakeTitle( texFilename, $, texCode, callback ) {
    if ($('title').text().length == 0) {
	if (texCode.match( /\\maketitle/ ))
	    report( texFilename, 0, "error", "no <title> but \\maketitle is present" );
	else
	    report( texFilename, 0, "error", "missing \\maketitle" );	    
    }
	
    callback( null );
}

////////////////////////////////////////////////////////////////
function checkMultipleChoicesAreAnswerable( texFilename, $, texCode, callback ) {
    $('div.multiple-choice').each( function(index, div) {
	var choices = $('span.choice',div);

	if (choices.length == 0)
	    report( texFilename, 0, "error", "multipleChoice with no choices" );
	
	var corrects = $('span.choice.correct',div);

	if (corrects.length == 0)
	    report( texFilename, 0, "error", "multipleChoice with no correct choices" );

	if (corrects.length > 1)
	    report( texFilename, 0, "warning", "multipleChoice with too many correct choices" );		
    });
	
    callback( null );
}

function checkProblemEnvironments( texFilename, $, texCode, callback ) {
    function surroundingProblems( e ) {
	return $(e).parents().filter( function(index, div) {
	    return $(div).hasClass('problem-environment');
	});
    }
    
    function verify( selector, name ) {
	$(selector).each( function(index, div) {
	    if (surroundingProblems(div).length == 0)
		report( texFilename, 0, "error", name + " not inside a problem environment" );
	});
    }

    verify( '.multiple-choice', 'multipleChoice' );
    verify( '.select-all', 'selectAll' );
    verify( '.free-response', 'freeResponse' );        

    $('script').each( function(index, script) {
	if ($(script).text().match( /\\answer/ )) {
	    if (surroundingProblems(script).length == 0)
		report( texFilename, 0, "error", "\\answer not inside a problem environment" );
	}
    });
    
    callback( null );    
}

////////////////////////////////////////////////////////////////
function checkSelectAll( texFilename, $, texCode, callback ) {
    $('div.select-all').each( function(index, div) {
	var choices = $('span.choice',div);

	if (choices.length == 0)
	    report( texFilename, 0, "error", "selectAll with no choices" );
	
	var corrects = $('span.choice.correct',div);

	if (corrects.length == 0)
	    report( texFilename, 0, "error", "selectAll with no correct choices" );

	if (corrects.length == 1)
	    report( texFilename, 0, "warning", "selectAll with only one correct choice" );		
    });
	
    callback( null );
}


////////////////////////////////////////////////////////////////
module.exports.lint = function( htmlFilename, niceFilename, callback ) {
    var texFilename = htmlFilename.replace( /\.html$/, '.tex' );

    fs.readFile(htmlFilename, function (err, data) {
	if (err)
	    callback(err);
	else {
	    var $ = cheerio.load( data );

	    fs.readFile(texFilename, function (err, texCode) {
		if (err)
		    callback(err);
		else {
		    texCode = texCode.toString();
		    
		    async.series([
			function(callback) {
			    checkMakeTitle( niceFilename, $, texCode, callback );
			},
			function(callback) {
			    checkMultipleChoicesAreAnswerable( niceFilename, $, texCode, callback );
			},
			function(callback) {
			    checkSelectAll( niceFilename, $, texCode, callback );
			},
			function(callback) {
			    checkProblemEnvironments( niceFilename, $, texCode, callback );
			},			
			
		    ], function(err) {
			callback(err);
		    });
		}
	    });
	}
    });
}

