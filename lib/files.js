var fs = require('fs');
var async = require('async');
var git = require('nodegit');
var path = require('path');
var url = require('url');
var recursive = require('recursive-readdir');
var winston = require('winston');
var crypto = require('crypto');
var cheerio = require('cheerio');

/** @function isTexDocument reads filename, checks for .tex extension and looks for \begin{document}, and callback(true) if it finds one and callback(false) if not */
function isTexDocument( filename, callback ) {
    if (!(filename.match( /\.tex$/ ))) {
	callback(false);
	return;
    } else
	fs.readFile( filename, function(err, data) {
	    if (err)
		callback(false);
	    else {
		if (data) {
		    data = data.toString()
			.replace(/%.*/g, '') // eliminate comments
			.replace(/\s/, '' ) // eliminate whitespace
		    ; 
		    
		    var re = new RegExp(
			"\\\\begin{document}",
			"gi");
		    
		    if (data.match(re))
			callback(true);
		    else
			callback(false);
		} else {
		    callback(false);
		}
	    }
	});
    
    return;
}

/** @function hashObject reads file with name filename and calls callback with (error, git object hash) */
function hashObject( filename, callback ) {
    fs.stat( filename, function(err, stats) {
	if (err) {
	    callback(err);
	} else {
	    var readStream = fs.createReadStream(filename);
	    var shasum = crypto.createHash('sha1');
	    shasum.write("blob " + stats.size + "\0" );
	    readStream.pipe(shasum);
	    
	    shasum.on('finish', function() {
		// the hash stream automatically pushes the digest
		// to the readable side once the writable side is ended
		callback(null, this.read());
	    }).setEncoding('hex');
	}
    });
}

/** @function isClean compares filename to the current commit, and calls callback with a boolean if the file matches the commited file */
function isClean( repositoryPath, filename, callback ) {
    // git seems to prefer (require?) relative paths from the repo root
    filename = path.relative( repositoryPath, filename );
    
    // Open the repository directory.
    git.Repository.open(repositoryPath)
	.then(function(repo) {
	     /* Get the current branch. */
	    return repo.getCurrentBranch().then(function(ref) {
		//console.log("On " + ref.shorthand() + " (" + ref.target() + ")");
		/* Get the commit that the branch points at. */
		return repo.getBranchCommit(ref.shorthand());
	    });	    
	})
	.then(function(commit) {
	    commit.getEntry(filename).then(function(entry) {
		var sha = entry.sha();
		// Use treeEntry
		hashObject( path.join(repositoryPath, filename), function(err, hash) {
		    if (err)
			callback( err );
		    else {
			if (hash == sha)
			    callback( null, true );
			else
			    callback( null, false );
		    }
		});
	    }, function( err ) {
		callback( err );
	    });
	});
};

/** @function isInRepository checks if filename is committed to the repo, and calls callback with a boolean AND NO ERROR */
function isInRepository( repositoryPath, filename, callback ) {
    // git seems to prefer (require?) relative paths from the repo root
    filename = path.relative( repositoryPath, filename );
    
    // Open the repository directory.
    git.Repository.open(repositoryPath)
	.then(function(repo) {
	     /* Get the current branch. */
	    return repo.getCurrentBranch().then(function(ref) {
		//console.log("On " + ref.shorthand() + " (" + ref.target() + ")");
		/* Get the commit that the branch points at. */
		return repo.getBranchCommit(ref.shorthand());
	    });
	}).then(function(commit) {
	    commit.getEntry(filename).then(function(entry) {
		callback( true );
	    }, function(err) {
		callback( false );
	    });
	}, function(err) {
	    callback( false );
	});
}

/** @function isUpToDate examines modification times to determine if a file needs to be compiled.
    @param {String} the source filename inputFilename
    @param {String} the name of the compiled output file, outputFilename; this file may be missing
    @param {Array} filenames of dependencies referenced in inputFilename
    @param {function} the callback(err, boolean) is called with a boolean as to whether or not the source file needs to be compiled
*/
function isUpToDate( inputFilename, outputFilename, dependencies, callback ) {
    async.waterfall([
	function(callback) {
	    fs.stat( inputFilename, callback );
	},
	function(inputStat, callback) {
	    callback( null, inputStat.mtime );
	},
	function(inputMTime, callback) {
	    fs.stat( outputFilename, function(err, outputStat) {
		if (err) {
		    // nonexistent files simply have a very old modification time
		    var veryOldTime = new Date(0);
		    callback( null, inputMTime, veryOldTime );
		} else {
		    callback( null, inputMTime, outputStat.mtime );
		}
	    });
	},
	function(inputMTime, outputMTime, callback) {
	    async.map( dependencies, fs.stat, function(err, results) {
		callback( err, inputMTime, outputMTime, results );
	    });
	},
	function(inputMTime, outputMTime, dependenciesStat, callback) {
	    if (inputMTime.getTime() > outputMTime.getTime())
		callback( null, false );
	    else {
		var allGood = true;
		
		dependenciesStat.forEach( function(s) {
		    if (s.mtime.getTime() > outputMTime.getTime())
			allGood = false;
		});

		callback( null, allGood );
	    }
	}
    ], function(err, result) {
	callback( err, result );
    });
}

/** @function latexDependencies reads filename, looks for inputs and includes, and callbacks with a list of normalized paths to dependencies */
function latexDependencies( filename, callback ) {
    fs.readFile( filename, function(err, data) {
	if (err)
	    callback(err);

	// Remove TeX comments
	data = data.toString().split("\n").map( function(x) { return x.replace(/%.*$/, ''); } ).join("\n");

	// I have no idea why this is necessary---can we delete this?
	data = data.replace(/\s/, '' );

	// Sometimes things are inside a verbatim environment; let's hackishly remove such things
	data = data.split("\n").join('');
	data = data.replace(/\\begin{verbatim}.*\\end{verbatim}/g, '' );
	
	var dependencies = [];

	// Permit space between an input command and the filename in braces
	var re = new RegExp(
            "\\\\(input|activity|include|includeonly)\\s*{([^}]+)}",
            "gi");
	
        var result;
        while ((result = re.exec(data)) !== null) {
            var dependency = path.normalize( path.join( path.dirname(filename), result[2] ) );
	    dependencies.push( dependency );
	}

	var resolvedDependencies = async.map(
	    dependencies,
	    function( dependency, callback ) {
		fs.stat( dependency, function(err, stats) {
		    if (err) {
			fs.stat( dependency + ".tex", function(err, stats) {
			    callback( err, dependency + ".tex" );
			});
		    } else
			callback( null, dependency );
		});
	    }, function( err, results ) {
		callback( err, results );
	    }
        );
    });
}

var filesInRepository = module.exports.filesInRepository = function( directory, condition, callback ) {
    async.waterfall([
	// Fetch all the possible filenames
	function(callback) {
	    winston.debug( "Recursively listing all files in " + directory );
	    recursive(directory, callback);
	},

	// Consider only the tex files
	function(filenames, callback) {
	    winston.debug( "Filtering out all but files matching the condition " + condition.name );
	    async.filter( filenames, condition, function(filenames) {
		callback( null, filenames );
	    });
	},

	// Consider only the files actually committed to the repository
	function(filenames, callback) {
	    winston.debug( "Filtering out files that haven't been committed to the repository" );
	    var test = function(filename, callback) {
		isInRepository( directory, filename, callback );
	    };
	    
	    async.reject( filenames, test, function(filenames) {
		filenames.forEach( function(filename) {
		    winston.warn( filename + " is not committed to the repository" );
		});
	    });
	    
	    async.filter( filenames, test, function(filenames) {
		callback( null, filenames );
	    });
	},

	// Confirm that the working copy matches the current commit
	function(filenames, callback) {
	    async.forEachOf( filenames, function(value, key, callback) {
		isClean( directory, value, function(err, clean) {
		    if (err)
			callback(err);
		    else {
			if (clean)
			    callback(null);
			else
			    callback(path.relative(directory, value) + " differs from what has been committed.");
		    }
		});
	    }, function(err) {
		callback( err, filenames );
	    });
	},	
    ], function(err, result) {
	if (err)
	    callback( err );
	else {
	    callback( null, result );
	}
    });
};

/** @function determineFilesToCompile examines all the files in the given directory (and its subdirectories) and calls callback with a list of files that require compilation */
var texFilesInRepository = module.exports.texFilesInRepository = function( directory, callback ) {
    filesInRepository( directory, isTexDocument, callback );
};

/** @function needingCompilation examines all the files in the given directory (and its subdirectories) and calls callback with a list of files that require compilation */
module.exports.needingCompilation = function( directory, callback ) {
    async.waterfall([
	function(callback) {
	    texFilesInRepository( directory, callback );
	},

	// Select only those that require recompilation
	function(filenames, callback) {
	    winston.debug( "Building dependency graph" );
	    
	    var filenamesToDependencies = {};
	    async.forEachOf( filenames, function(value, key, callback) {
		latexDependencies( value, function(err, dependencies) {
		    filenamesToDependencies[value] = dependencies;
		    callback(err);
		});
	    }, function(err) {
		callback( err, filenames, filenamesToDependencies );
	    });
	},
	    
	// Select only those that require recompilation
	function(filenames, dependencies, callback) {
	    winston.debug( "Filtering out files that are older than the corresponding output file" );
	    
	    var test = function(filename, callback) {
		var outputFilename = filename.replace( /.tex$/, '.html' );
		
		isUpToDate( filename, outputFilename, dependencies[filename], function(err, result) {
		    if (err) // async.filter can't really handle errors, so ignore them
			callback(false);
		    else {
			if (result)
			    winston.info( "No need to recompile " + path.relative( directory, filename ) );
			
			callback(result);
		    }
		});
	    };
	    
	    // Get rid of files that are up to date
	    async.reject( filenames, test, function(filenames) {
		callback( null, filenames );
	    });
	},		
	
    ], function(err, result) {
	if (err)
	    callback( err );
	else {
	    callback( null, result );
	}
    });
}

function escapeRegExp(string){
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function changeExtension( filename, newExtension ) {
    var oldExtension = path.extname( filename );
    var reExtension = new RegExp( escapeRegExp( oldExtension ) + '$' );
    return filename.replace( reExtension, '.' + newExtension );
}

// Find images and HTML files associated with the given tex file
function identifyFilesAssociatedWithFile( texFilename, callback ) {
    var htmlFilename = changeExtension( texFilename, 'html' );

    fs.readFile( htmlFilename, function(err, data) {
	if (err)
	    // If an HTML file is missing, just ignore it
	    callback( null, [] );
	else {
	    var results = [];
	    var $ = cheerio.load( data );

	    // Only use files which were generated by ximera, i.e., used a ximera-based class file in htlatex
	    var isXimera = $('meta[name="ximera"]').length > 0;
	    if (isXimera) {
		results = [htmlFilename];
		
		$('img').each( function() {
		    var imgSrc = url.parse( $(this).attr('src') );
		    // If this is a local image
		    if (!(imgSrc.hostname)) {
			var imgPath = path.join( path.dirname(texFilename), imgSrc.path );
			results.push( imgPath );
			
			if (path.extname( imgPath ) == '.svg')
			    results.push( changeExtension( imgPath, 'png' ) );
		    }
		});
	    }
	    
	    callback( null, results );
	}
    });
}

// For a list of tex files, identify all the associated assets
var identifyAssociatedFiles = module.exports.identifyAssociatedFiles = function( texFilenames, callback ) {
    async.map( texFilenames, identifyFilesAssociatedWithFile,
	       function(err, results) {
		   if (err)
		       callback( err, [] );
		   else {
		       var flattened = results.reduce(function(a, b) {
			   return a.concat(b);
		       }, []);
		       
		       callback( null, flattened );
		   }
	       });
}


module.exports.publishableFiles = function( repositoryPath, callback ) {
    var results = [];

    function isCssOrJavascriptFilename(filename, callback) {
	callback( (path.extname(filename) == ".js") || (path.extname(filename) == ".css") );
    };

    async.waterfall([
	function(callback) {
	    winston.debug( "Get all the TeX files in " + repositoryPath );
	    texFilesInRepository( repositoryPath, callback );
	},

	function(texFilenames, callback) {
	    results.push( texFilenames );
	    winston.debug( "Get the associated images and HTML files." );
	    identifyAssociatedFiles( texFilenames, callback );
	},	
	
	function(associatedFiles, callback) {
	    results.push( associatedFiles );
	    winston.debug( "Get the JavaScript and CSS files." );
	    filesInRepository( repositoryPath, isCssOrJavascriptFilename, callback );
	},
	
    ], function(err, otherAssets) {
	if (err)
	    callback( err, [] );
	else {
	    results.push( otherAssets );

	    var flattened = results.reduce(function(a, b) {
		return a.concat(b);
	    }, []);
	    
	    callback( null, flattened );
	}
    });
};

module.exports.isXourse = function( htmlFilename, callback ) {
    // Xourse files must be .html files
    if (!(htmlFilename.match( /\.html/ ))) {
	callback( false );
	return;
    } else {
	fs.readFile( htmlFilename, function(err, data) {
	    if (err)
		// If an HTML file is missing, just ignore it
		callback( false );
	    else {
		var $ = cheerio.load( data );
		
		var isXourse = $('meta[name="description"]').attr('content') == 'xourse';
		callback( isXourse );
	    }
	});
    }
    
    return;
};

// activity files include all non-xourse files
module.exports.isActivity = function( htmlFilename, callback ) {
    module.exports.isXourse( htmlFilename, function(err, result) {
	callback( ! result );
    });

    return;
};
