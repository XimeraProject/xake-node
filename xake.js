var async = require('async')
  , git = require('nodegit')
  , winston = require('winston')
  , crypto = require('crypto')
  , githubApi = require('github')
  , cheerio = require('cheerio')
  , fdSlicer = require('fd-slicer')
  , pathLibrary = require('path')
  , path = require('path')
  ;

/****************************************************************/
// Print welcome message
console.log( "This is xake, Version " + require('./package.json').version + "." );


// I wish I hadn't used a variable called "path" in so many places...  This is confusing.
var path = pathLibrary;
var extname = pathLibrary.extname;
var basename = pathLibrary.basename;

var XIMERA_URL = "https://ximera.osu.edu/sha/";

var tar = require("tar")
, fstream = require("fstream")
, fs = require("fs");

var exec = require('child_process').exec;
var child_process = require('child_process');

/** @function saveToContentAddressableFilesystem saves data to the CAFS and returns a hash via the callback */
function saveToContentAddressableFilesystem( data, callback ) {
    var hash = "";
    
    async.series(
	[
	    // Compute hash
    function(callback) {
		var shasum = crypto.createHash('sha256');
		shasum.update(data);
		hash = shasum.digest('hex');
		callback(null);
	    },
	    
	    function(callback) {
		var blob = new mdb.Blob({
		    hash: hash,
		    data: data
		});
		
		blob.save(callback);
	    }
	],function(err, result) {
	    callback( err, hash );
	    return;
	}
    );

    return;
}

/* This should be using git clone --mirror so that I can git clone without pulling everything from github every single time. */

/* Then I have to
   * update the mirror (which should only pull the new data)
   * git clone (from the mirror).
   * get this into qemu using sandbox.sh
   * pdflatex all the tex files inside the sandbox
   * store the log output under the the sha1's for the tex file
   * store the PDFs
   * rasterize the PNGs 
   * convert the PDFs to SVGs
*/

/** @function createMirror asynchronously initializes a bare repoDirectory with the contents of the github repo at githubIdentifier
*/
function createMirror( githubIdentifier, repoDirectory, callback ) {
    
    async.waterfall([
    	function (callback) {
	    winston.info( "Creating a bare repo at " + repoDirectory + "..." );
	    git.Repository.init(repoDirectory, 1 ).then( function(repo) {
		callback( null, repo );
	    }).catch( function(err) { callback(err); });
	},
	
	function (repo, callback) {
	    winston.info( "Creating an 'origin' remote with the mirror fetch refspec..." );
	    var result = git.Remote.createWithFetchspec(repo, "origin", "http://github.com/" + githubIdentifier, "+refs/*:refs/*").then( function(origin) {
		callback( null, repo, origin );
	    }).catch( function(err) { callback(err); });
	},
	
	function (repo, origin, callback) {
	    winston.info( "Opening repository configuration options..." );
	    repo.config().then( function(config) {
		winston.info( "Setting remote.origin.mirror = true for compatibility with git-core..." );
		// There is a missing config.setBool method, but setString does the right thing in the repository's config file
		config.setString("remote.origin.mirror", "true" ).then( function(result) {
		    callback(null);
		});
	    }).catch( function(err) { callback(err); });
	},
	
    ], function (err, result) {
	callback( err );
    });
}

/** @function processMatchingFiles runs handler on each file matching extension stored in the tar file at outputTarPath
    @param {string} readStream to process
    @param {string} extension
    @param {string} handler
*/
function processMatchingFiles(readStream, extension, handler, callback)
{
    winston.info( "Reading output tarfile for " + extension + " files..." );
    
    var finished = false;
    
    // Queue for saving tex file content to the database
    var q = async.queue(function (task, callback) {
	handler( task.path, task.text, callback );
    }, 2 );
    
    q.drain = function() {
	if (finished)
	    callback(null);
    };
    
    readStream
	.pipe(tar.Parse())
	.on("end", function(e) {
	    if (q.length() > 0)
		finished = true;
	    else
		callback(null);
	})
	.on("entry", function (e) {
	    var path = e.props.path.replace( /^.\//, "" );
	    
	    var regexp = extension;
	    if (typeof extension  === 'string' || extension instanceof String)
		var regexp = new RegExp("\\." + extension + "$","g");
	    
	    if (path.match( regexp )) {
		// Grab text as it comes in through the stream
		var text = new Buffer(0);
		
		e.on("data", function (c) {
		    text = Buffer.concat([text,c]);
		});
		
		// When the file is finished...
		e.on("end", function () {
		    q.push( { path: path, text: text }, function(err) {
			winston.info( "Finished processing " + path );
		    });
		});
	    }
	});

    return;
}

/** @function updateCachedMirror asynchronously creates (or refreshes) a bare repo containing a mirrored copy of the repo at githubIdentifier
    @param {string} githubIdentifier 
    @param callback called with the repoDirectory, which is a base64 encoding of the github identifier in a .cache directory
*/
function updateCachedMirror( githubIdentifier, callback ) {
    var homeDirectory = process.env.HOME;
    var cacheDirectory = path.resolve( homeDirectory, '.cache', 'ximera' );
    var cacheSubdirectory = new Buffer(githubIdentifier).toString('base64');
    var repoDirectory = path.resolve( cacheDirectory, cacheSubdirectory );    
    
    async.waterfall([
	function (callback) {
	    // Create bare repo if repoDirectory doesn't exist
	    winston.info( "Checking if there is a repo at " + repoDirectory + "..." );
	    fs.exists(repoDirectory, function(exists) {
		if (!exists) {
		    createMirror( githubIdentifier, repoDirectory, callback );
		} else {
		    callback( null );
		}
	    });
	},

	function (callback) {
	    winston.info( "Opening bare repository at " + repoDirectory + "..." );
	    git.Repository.openBare(repoDirectory).then( function(repo) {
		callback( null, repo );
	    }).catch( function(err) { callback(err); });
	},

	function (repo, callback) {
	    winston.info( "Getting remote..." );
	    git.Remote.lookup( repo, "origin" ).then( function(remote) {
		callback( null, repo, remote );
	    }).catch( function(err) { callback(err); });
	},

	function (repo, origin, callback) {
	    winston.info( "Fetching remote from http://github.com/" + githubIdentifier + "..." );
	    var refspecs = "";
	    origin.fetch(refspecs, git.Signature.now( "Ximera", "ximera@math.osu.edu" ), "fetch").then( function() {
		callback( null, repoDirectory );
	    });
	},
    ], function (err, result) {
	callback( err, result );
    });
}

/** @function updateRepo
    Grab a copy of the repo given by githubIdentifier, fetch the content associated to the given commitSha, and run LaTeX on it inside a sandbox, saving the results in the database
    @param {string} githubIdentifier 
*/
function updateRepo(githubIdentifier, commitSha, callback) {
    var repositoryDirectory = "";
    var bareDirectory = "";
    var sandboxTarPath = "";
    var overlayPath = "";
    var outputTarPath = "";
    var outputTarFd = -1;
    var outputTarSlicer;
    var repository = null;
    var headCommit = null;
    var xourses = [];
    
    async.waterfall([
	// Get the repository from the repo
	function (callback) {
	    mdb.GitRepo.findOne({gitIdentifier: githubIdentifier}).exec( function (err, repoInformation) {
		callback(err, repoInformation);
	    });
	},

	function (repoInformation, callback) {
	    winston.info( "Creating or updating the mirror..." );
	    updateCachedMirror( githubIdentifier, function(err, directory) {
		winston.info( "Created or updated at " + directory );
		bareDirectory = directory;
		callback( err ); 
	    });
	},

	function (callback) {
	    repositoryDirectory = "/tmp/sandbox";
	    winston.info( "Clearing temporary directory " + repositoryDirectory + "..." );
	    rimraf(repositoryDirectory, function(err) {
		callback( err );
	    });
	},

	/*
	function (callback) {
	    winston.info( "Creating temporary directory..." );
	    temp.mkdir('sandbox', function(err, dirPath) {
		repositoryDirectory = dirPath;
		callback( null );
	    });
	},
	*/
	
	function (callback) {
	    winston.info( "Cloning the mirror from " + bareDirectory + " into " + repositoryDirectory );
	    git.Clone.clone(bareDirectory, repositoryDirectory, null ).then( function(repo) {
		callback( null  );
	    }).catch( function(err) { callback(err); });
	},

	function (callback) {
	    winston.info( "Opening repository..." );
	    git.Repository.open(repositoryDirectory).then( function(repo) {
		repository = repo;
		callback( null );
	    }).catch( function(err) { callback(err); });
	},

	/*
	function (callback) {
	    winston.info( "Finding HEAD reference in repository at " + repository.path() + "..." );
	    repository.getReference("HEAD", function(err, ref) {
		if (err) callback(err);

		winston.info( "Finding HEAD commit in repository..." );
		repository.getCommit(ref.target(), function (err, commit) {
		    console.log( "commit = ", commit.sha() );
		    headCommit = commit;
		    callback(err);
		});
	    });
	},
	*/

	function (callback) {
	    winston.info( "Finding given commit in repository..." );
	    repository.getCommit(commitSha, function (err, commit) {
		console.log( "commit = ", commit.sha() );
		headCommit = commit;
		callback(err);
	    });
	},	

	function (callback) {
	    winston.info( "Resetting to the given commit..." );
	    git.Reset.reset( repository, headCommit, git.Reset.TYPE.HARD, null, git.Signature.now( "Ximera", "ximera@math.osu.edu" ), "fetch").then(
		function(result) {
		    callback( null );
		});
	},	
	
	/*
	function (callback) {
	    winston.info( "Display README.md for fun" );
	    fs.readFile(path.resolve( repositoryDirectory, "README.md" ), 'utf8', function (err,data) {
		console.log( data );
		//exec( "cat " + repositoryDirectory + "/README.md" );
		callback( null );
	    });
	},
	*/
	
	function (callback) {
	    winston.info( "Queueing sandbox commands..." );
	    commands = "";
	    commands = commands + "#!/bin/bash\n";
	    // Change to the sandbox directory
	    commands = commands + "systemctl stop serial-getty@ttyS0\n";
	    commands = commands + "cd ~/sandbox\n";
	    // Set up some of the environment
	    commands = commands + "export HOME=/root\n";
	    commands = commands + "export PATH=/usr/local/sbin:/usr/local/bin:/usr/bin:/usr/bin/site_perl:/usr/bin/vendor_perl:/usr/bin/core_perl\n";
	    // Make the line length a bit bigger on the latex log output
	    commands = commands + "export max_print_line=2048\n";
	    commands = commands + "export TEXMFHOME=/root/texmf\n";
	    // Convert the PDF files to SVG files -- no need to do this now because the tikz images will be handled automatically
	    //commands = commands + 'find . -iname \'*.pdf\' -execdir pdf2svg {} {}.svg \\; > /dev/ttyS0\n';
	    commands = commands + 'find . -iname \'*.pdf\' -print0 | xargs -0 -n1 bash -c \'pdf2svg $0 ${0/.pdf/.svg}\'\n';
	    // Add the tikzexport class option to every tex file
	    commands = commands + 'echo -------------------------------------------------------- > /dev/ttyS0\n';
	    commands = commands + 'echo Adding tikzexport option... > /dev/ttyS0\n';	    	    	    
	    commands = commands + 'find . -iname \'*.tex\' -execdir sed -i \'1s/^/\\\\PassOptionsToClass{tikzexport}{ximera}\\\\nonstopmode/\' {} \\;\n';
	    // Run pdflatex just once on all tex files
	    //commands = commands + 'cd dig\n';
	    //commands = commands + 'pdflatex -shell-escape digInTheDerivativeViaLimits.tex > /dev/ttyS0\n';
	    //commands = commands + 'pdflatex -shell-escape -halt-on-error -jobname "./digInTheDerivativeViaLimits-figure0" "\\def\\tikzexternalrealjob{digInTheDerivativeViaLimits}\\input{digInTheDerivativeViaLimits}" > /dev/ttyS0\n';
	    //commands = commands + 'poweroff\n';
	    commands = commands + 'echo -------------------------------------------------------- > /dev/ttyS0\n';
	    commands = commands + 'echo Checking health... > /dev/ttyS0\n';
	    commands = commands + 'echo $ du > /dev/ttyS0\n';	    
	    commands = commands + 'du > /dev/ttyS0\n';
	    commands = commands + 'echo $ df > /dev/ttyS0\n';	    	    
	    commands = commands + 'df > /dev/ttyS0\n';	    	    
	    commands = commands + 'echo -------------------------------------------------------- > /dev/ttyS0\n';
	    commands = commands + 'echo Running pdflatex... > /dev/ttyS0\n';	    
	    commands = commands + 'find . -iname \'*.tex\' -execdir echo {} \\; > /dev/ttyS0\n';
	    commands = commands + 'echo -------------------------------------------------------- > /dev/ttyS0\n';
	    commands = commands + 'echo Checking health... > /dev/ttyS0\n';
	    commands = commands + 'echo $ du > /dev/ttyS0\n';	    
	    commands = commands + 'du > /dev/ttyS0\n';
	    commands = commands + 'echo $ df > /dev/ttyS0\n';	    	    
	    commands = commands + 'df > /dev/ttyS0\n';
	    // pdflatex is needed to generate .jax files and also the svg images
	    commands = commands + 'echo -------------------------------------------------------- > /dev/ttyS0\n';
	    commands = commands + 'echo Running pdflatex and tex4ht... > /dev/ttyS0\n';
	    //commands = commands + 'find . -iname \'*.tex\' -execdir pdflatex -file-line-error -shell-escape {} \\; -execdir sync \\; -execdir htlatex {} "ximera,charset=utf-8,-css" "" "" "--interaction=nonstopmode -shell-escape -file-line-error" \\; -execdir sync \\; > /dev/ttyS0\n';
	    commands = commands + 'find . -iname \'*.tex\' -execdir pdflatex -shell-escape {} \\; -execdir ls \\; > /dev/ttyS0\n';
	    commands = commands + 'find . -iname \'*.tex\' -execdir htlatex {} "ximera,charset=utf-8,-css" "" "" "--interaction=nonstopmode -shell-escape -file-line-error" \\; > /dev/ttyS0\n';	    
	    // Tidy up the html files
	    commands = commands + 'echo $ df > /dev/ttyS0\n';
	    commands = commands + 'df > /dev/ttyS0\n';	    
	    commands = commands + 'echo -------------------------------------------------------- > /dev/ttyS0\n';
	    commands = commands + 'echo Running tidy... > /dev/ttyS0\n';	    
	    //commands = commands + 'find . -iname \'*.html\' -execdir tidy -m -asxhtml -utf8 -q -i {} \\; > /dev/ttyS0\n';
	    // Save everything to the block device; we're using * instead of . because I don't want .git files to be tarred
	    commands = commands + 'echo -------------------------------------------------------- > /dev/ttyS0\n';
	    commands = commands + 'echo Tarring output... > /dev/ttyS0\n';	    	    
	    commands = commands + "tar -cvf /dev/sdc * > /dev/ttyS0\n";
	    // Exit
	    commands = commands + 'echo -------------------------------------------------------- > /dev/ttyS0\n';
	    commands = commands + 'echo Powering off... > /dev/ttyS0\n';	    	    	    
	    commands = commands + "poweroff\n";
	    
	    fs.writeFile(path.resolve( repositoryDirectory, "sandbox.sh" ), commands, function (err,data) {
		callback( err );
	    });
	},

	function (callback) {
	    winston.info( "Making sandbox.sh executable..." );
	    fs.chmod(path.resolve( repositoryDirectory, "sandbox.sh" ), '700', function(err,data) {
		callback(err);
	    });
	},

	function (callback) {
	    winston.info( "Creating temporary tar file..." );
	    temp.open({prefix: "sandbox", suffix: ".tar"}, function(err, info) {
		sandboxTarPath = info.path;
		callback(err);
	    });
	},
	
	function (callback) {
	    winston.info( "Packing tarfile with repository contents..." );

	    var destination = fs.createWriteStream(sandboxTarPath);
	    
	    var packer = tar.Pack({ noProprietary: true })
		.on('error', callback)
		.on('end', function () { callback(null); } );

	    fstream.Reader({ path: repositoryDirectory, type: "Directory" })
		.on('error', callback)
		.pipe(packer)
		.pipe(destination);
	},

	function (callback) {
	    winston.info( "Creating temp overlay file..." );
	    temp.open('overlay', function(err, info) {
		overlayPath = info.path;
		callback( err );
	    });
	},
	
	function( callback ) {
	    winston.info( "Initializing disk overlay with linux image..." );
	    var qemu_img = child_process.spawn( "qemu-img", ['create',
							     '-o','backing_file=' + path.resolve(process.cwd(),'linux','archlinux.raw') + ',backing_fmt=raw',
							     '-f','qcow2',
							     overlayPath] );

	    qemu_img.stdout.on('data', function (data) {
		winston.info('stdout: ' + data);
	    });

	    qemu_img.stderr.on('data', function (data) {
		winston.info('stderr: ' + data);
	    });
	    
	    qemu_img.on('close', function (code) {
		if (code == 0) {
		    callback( null );
		} else {
		    callback( code );
		}
	    });
	},

	function( callback ) {
	    winston.info( "Initializing empty disk..." );
	    
	    temp.open({prefix: "output", suffix: ".tar"}, function(err, info) {
		if (err) {
		    callback( err );
		} else {
		    outputTarPath = info.path;
		    outputTarFd = info.fd;
		    
		    // 500 megabytes of available output space
		    var writeBuffer = new Buffer (1024*1024*500);
		    
		    var bufferPosition = 0,
			bufferLength = writeBuffer.length,
			filePosition = null;
		    
		    fs.write( info.fd,
			      writeBuffer,
			      bufferPosition,
			      bufferLength,
			      filePosition,
			      function (err, written) {
				  if (err) {
				      callback( err, overlayPath, null );
				  } else {
				      fs.fsync(info.fd, function(err) {
					  outputTarSlicer = fdSlicer.createFromFd(info.fd);
					  callback( err );
				      });
				  }
			      });
		}
	    });
	},
	
	function( callback ) {
	    winston.info( "Running LaTeX inside sandbox..." );
	    
	    var qemu = child_process.spawn( "qemu-system-x86_64", ['-enable-kvm',
								   '-cpu','host',
								   '-m','1024',
								   '-hda', overlayPath,
								   '-hdb', sandboxTarPath,
								   '-hdc', outputTarPath,
								   '-kernel',"linux/vmlinuz-linux",
								   "-initrd","linux/initramfs-linux.img",
								   "-append",'console=ttyS0 root=/dev/sda',
								   "-nographic"
								  ]);

	    // Look at each line of output---although sometimes line are split when they are fed to stdout.on
	    var remainder = "";
	    var qemuLog = [];
	    var qemuError = null;

	    var lastOutputTime = process.hrtime();
	    
	    qemu.stdout.on('data', function (data) {
		var lines = (remainder + data).split( "\n" );
		remainder = lines.pop();

		/*
		  THERE MIGHT BE A DAY WHEN IT IS EASIER TO JUST CONTROL THE QEMU PROCESS BY HAND
		  
		if (remainder.match("elba login:")) {
		    qemu.stdin.write("root\n");
		}

		var firstTime = true;
		
		if (firstTime && (remainder.match("\\[root@elba ~\\]# "))) {
		    qemu.stdin.write("systemctl start sandbox\n");
		    qemu.stdin.write("tar -xvf /dev/sdb ; source sandbox/sandbox.sh\n");
		    firstTime = false;
		}
		*/
		
		lines.forEach( function(line) {
		    qemuLog.push( line );
		    console.log( line );

		    if (line.match("Failed to start Sandbox Service.")) {
			qemuError = "Failed to start Sandbox Service.";
			qemu.kill();
		    }
		});

		lastOutputTime = process.hrtime();
	    });

	    // Every second, see if we have gone a while without seeing any output from the sandboxed process
	    var watchdog = setInterval( function() {
		var secondsSinceLastOutput = process.hrtime(lastOutputTime)[0];

		// If so, kill the sandbox.
		if (secondsSinceLastOutput > 300) {
		    qemuError = "Too many seconds passed without output.";
		    qemu.kill();
		}
	    }, 1000 );
	    

	    qemu.on('close', function (code) {
		clearInterval( watchdog );
		callback( qemuError );
	    });
	},

	function (callback) {
	    winston.info( "fsync the output file descriptor" );
	    fs.fsync(outputTarFd, function(err) {	    
		callback(err);
	    });
	},
	
	function (callback) {
	    winston.info( "Saving git blobs and trees..." );
	    
	    processMatchingFiles(outputTarSlicer.createReadStream(), new RegExp("\\.(tex|js|css)$", "g"),
				 function( path, text, callback ) {
				     winston.info( "Saving " + path + "..." );
				     headCommit.getEntry(path).then(function(entry) {
					 async.parallel(
					     [
						 function(callback) {
						     var gitFile = new mdb.GitFile({
							 hash: entry.sha(),
							 commit: headCommit.sha(),
							 path: path
						     });
						     
						     gitFile.save(callback);
						 },
						 
						 function(callback) {
						     var blob = new mdb.Blob({
							 hash: entry.sha(),
							 data: text
						     });
						     
						     blob.save(callback);
						 },
					     ], callback );
				     }).catch( function(err) {
					 // Silently ignore tex files that aren't in the git repo
					 callback(null);
				     });
				 }, callback);
	},

	function (callback) {
	    winston.info( "Saving log files..." );
	    
	    processMatchingFiles(outputTarSlicer.createReadStream(), "log",
				 function( path, text, callback ) {
				     var texpath = path.replace( /.log$/, ".tex" );
				     // Get the associated SHA's and...
				     headCommit.getEntry(texpath).then(function(entry) {
					 // Save the log to the database
					 var compileLog = new mdb.CompileLog({
					     hash: entry.sha(),
					     commit: headCommit.sha(),
					     log: text
					 });
					 
					 var errorList = [];
					 
					 var errorRegexp = /^! (.*)\nl\.([0-9]+) /g;
					 var match = errorRegexp.exec(text);
					 while (match != null) {
					     errorList.push( { error: match[1], line: match[2], file: texpath } );
					     match = errorRegexp.exec(text);
					 }
					 
					 compileLog.errorList = errorList;
					 compileLog.save(callback);
				     }).catch( function(err) {
					 // Silently ignore log files that don't have tex files in the git repo
					 callback(null);
				     });
				 }, callback);
	},	

	function (callback) {
	    winston.info("Saving HTML files...");
	    //BADBAD

	},	
	
	function (callback) {
	    winston.info("Saving images...");
	    processMatchingFiles(outputTarSlicer.createReadStream(), new RegExp("\\.(pdf|svg|jpg|png)$", "g"),
				 function( path, text, callback ) {
				     saveToContentAddressableFilesystem( text, function(err, hash) {
					 var gitFile = new mdb.GitFile();
					 gitFile.commit = headCommit.sha();
					 gitFile.path = path;
					 gitFile.hash = hash;
					 gitFile.save(callback);
				     });
				 }, callback);
	},

	function (callback) {
	    winston.info("Closing outputTarFd...");
	    fs.close( outputTarFd, function(err) {
		callback(err);
	    });
	},
	
	function (callback) {
	    winston.info("Cleaning up temporary files...");
	    temp.cleanup(function(err, stats) {
		winston.info("Cleaned up " + stats.files + " temp files");
		callback(err);
	    });
	},

	function (callback) {
	    winston.info("Caching activity information into xourses...");

	    async.each(xourses,
		       function(xourse, callback) {
			   winston.info( "Processing xourse file at " + xourse.path );
			   
			   // Find all activities for the given xourse
			   mdb.Activity.find( { commit: xourse.commit, path: { $in: xourse.activityList } }, function(err, activities) {
			       if (err)
				   callback(err);
			       else {
				   var activityHash = {};

				   async.each(activities, function(activity, callback) {
				       if (!(activity.path in activityHash))
					   activityHash[activity.path] = {};
				       
				       activityHash[activity.path].title = activity.title;
				       activityHash[activity.path].hash = activity.hash;				       
				       
				       mdb.Blob.findOne({hash: activity.hash}, function(err, blob) {
					   winston.info( "Parsing HTML for " + activity.path );

					   var $ = cheerio.load( blob.data );
					   
					   var images = $('img');
					   if (images.length > 0)
					       activityHash[activity.path].splashImage = pathLibrary.normalize(
						   pathLibrary.join( pathLibrary.dirname( activity.path ),
								     images.first().attr('src') ) );

					   var summary = $('div.abstract');
					   if (summary.length > 0)
					       activityHash[activity.path].summary = summary.text();
					   
					   var beginning = $('p');
					   if (beginning.length > 0)
					       activityHash[activity.path].beginning = beginning.first().text();
					   
					   callback(err);
				       });
				   }, function(err) {
				       xourse.activities = activityHash;
				       xourse.markModified('activities');
				       
				       xourse.save(callback);
				   });
			       }
			   });			   
		       },
		       callback);
	},

	function (callback) {
	    winston.info("Caching all previous hashes into xourses...");

	    async.each(xourses,
		       function(xourse, callback) {
			   winston.info( "Finding old activities for xourse at " + xourse.path );

			   findOldActivities( xourse, function(err, activities) {
			       if (err)
				   callback(err);
			       else {
				   activities.forEach( function(activity) {
				       if ( ! (activity.path in xourse.activities))
					   xourse.activities[activity.path] = {};
				       
				       if ( ! ('hashes' in xourse.activities[activity.path]))
					   xourse.activities[activity.path].hashes = [];
				       
				       if (xourse.activities[activity.path].hashes.indexOf( activity.hash ) < 0) {
					   xourse.activities[activity.path].hashes.push( activity.hash );
					   xourse.markModified('activities');
				       }
				   });
				   
				   xourse.save(callback);
			       }
			   });
		       },
		       callback);
	},	
	
	function (callback) {
	    console.log( "All done." );
	    callback( null );
	},
	
    ], function (err, result) {
	console.log( "Done." );
	
	// This needs to post an appropriate error as a GitHub status, with a link to a Ximera page which details all the errors
        if (err) {
	    winston.error(JSON.stringify(err));
	    winston.error(err.toString('utf-8'));
	    console.log( "err!" );
	    //mdb.GitRepo.update( repo, {$set: { feedback : err.toString('utf-8') }}, {}, function( err, document ) {} );

        } else {
	    winston.info("Success.");
	}
	
	callback( err, null );
    });
}

/****************************************************************/

console.log( "bake" );
var argv = require('minimist')(process.argv.slice(2));
console.log(argv);

/** @function hashObject reads file with name filename and calls callback with (error, git object hash) */
function hashObject( filename, callback ) {
    fs.stat( filename, function(err, stats) {
	var readStream = fs.createReadStream(filename);
	var shasum = crypto.createHash('sha1');
	shasum.write("blob " + stats.size + "\0" );
	readStream.pipe(shasum);
	
	shasum.on('finish', function() {
	    // the hash stream automatically pushes the digest
	    // to the readable side once the writable side is ended
	    callback(null, this.read());
	}).setEncoding('hex');
    });
}

/** @function isInRepository checks if filename is committed to the repo, and calls callback with a boolean AND NO ERROR */
function isInRepository( filename, callback ) {
    // Open the repository directory.
    git.Repository.open(".")
	.then(function(repo) {     // Open the master branch.
	    return repo.getMasterCommit();
	})
	.then(function(commit) {
	    commit.getEntry(filename).then(function(entry) {
		callback( true );
	    }, function(err) {
		callback( false );
	    });
	}, function(err) {
	    callback( false );
	});
}

/** @function isClean compares filename to the master commit, and calls callback with a boolean if the file matches the commited file */
function isClean( filename, callback ) {
    // Open the repository directory.
    git.Repository.open(".")
	.then(function(repo) {     // Open the master branch.
	    return repo.getMasterCommit();
	})
	.then(function(commit) {
	    commit.getEntry(filename).then(function(entry) {
		var sha = entry.sha();
		// Use treeEntry
		hashObject( filename, function(err, hash) {
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

/** @function latexDependencies reads filename, looks for inputs and includes, and callbacks with a list of normalized paths to dependencies */
function latexDependencies( filename, callback ) {
    fs.readFile( filename, function(err, data) {
	if (err)
	    callback(err);

	data = data.toString().replace(/\s/, '' );

	var dependencies = [];
	
	var re = new RegExp(
            "\\\\(input|activity|include|includeonly){([^}]+)}",
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

/** @function isTexDocument reads filename, checks for .tex extension and looks for \begin{document}, and callback(true) if it finds one and callback(false) if not */
function isTexDocument( filename, callback ) {
    if (!(filename.match( /\.tex$/ ))) {
	callback(false);
	return;
    } else
	fs.readFile( filename, function(err, data) {
	    if (err)
		callback(false);
	    
	    data = data.toString().replace(/\s/, '' );
	    
	    var re = new RegExp(
		"\\\\begin{document}",
		"gi");
	    
	    if (data.match(re))
		callback(true);
	    else
		callback(false);
	});
    
    return;
}

/****************************************************************/
// Here we actually PROCESS the input tex files into html files

var spawn = require('child_process').spawn;

function isXourseHtmlFile( filename, callback ) {
}

function transformHtml( filename, callback ) {

				 function( filename, text, callback ) {
				     // Get the title from the filename, or the <title> tag if there is one
				     var $ = cheerio.load( text );
				     var title = $('title').html();
				     if (!(title))
					 title = basename(filename).replace(".html", "");

				     if ($('meta[name="description"]').attr('content') == 'xourse') {
					 // This is a "xourse" file which describes the global structure of a course
					 winston.info( "Saving xourse file..." );
					 
					 var $ = cheerio.load( text );

					 // Normalize the activity links
					 $('a.activity').each( function() {
					     var href = $(this).attr('href');
					     
					     href = pathLibrary.normalize( 
						 pathLibrary.join( pathLibrary.dirname( path ),
								   href )
					     );

					     href = href.replace( /\.tex$/, '' );
					     
					     $(this).attr('href', href);
					 });					 
					 
					 var text = $('body').html();
				     
					 saveToContentAddressableFilesystem( text, function(err, hash) {
					     var xourse = new mdb.Xourse();
					     
					     // Save the HTML file to the database as an xourse
					     xourse.commit = headCommit.sha();
					     xourse.hash = hash;
					     xourse.path = path.replace( /.html$/, "" );
                                             xourse.title = title;
					     xourse.activityList = [];

					     // Go through the xourse text and add the activity URLs to the activity list
					     $('a.activity').each( function() {
						 xourse.activityList.push( $(this).attr('href') );
					     });
					     
					     // Save xourse for additional processing later
					     xourses.push( xourse );
					     
					     xourse.save(callback);
					 });
				     } else {
					 // This is a regular activity

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
					     });
					 } else {
					     // text is possibly null if, say, the HTML file is malformed somehow
					     callback(null);
					 }
				     }
				 }, callback);

function pdflatex( filename, callback )
{
    var tikzexport = '"\\PassOptionsToClass{tikzexport}{ximera}\\nonstopmode\\input{' + path.basename(filename) + '}"';
    
    var latex  = spawn('pdflatex', ['-file-line-error', '-shell-escape', tikzexport],
		       { cwd: path.dirname(filename) });
    
    latex.stdout.on('data', function (data) {
	process.stdout.write(data);
    });
    
    latex.on('close', function (code) {
	console.log('pdflatex exited with code ' + code);
	
	if (code != 0) {
	    callback( "pdflatex on " + filename + " failed with " + code );
	} else {
	    callback( null );
	}
    });
}

function htlatex( filename, callback ) {
    var htlatex  = spawn('htlatex', [path.basename(filename), "ximera,charset=utf-8,-css", "", "", "--interaction=nonstopmode -shell-escape -file-line-error"],
			 { cwd: path.dirname(filename) });	    

    htlatex.stdout.on('data', function (data) {
	process.stdout.write(data);
    });
	    
    htlatex.on('close', function (code) {
	console.log('htlatex exited with code ' + code);
	
	if (code == 0) {
	    console.log( "good job with " + filename );
	    callback( null );
	}
    });
}

/****************************************************************/

// BADBAD: this should be chained together with the rest of the concurrent start-up

/** @function isXimeraClassFileInstalled calls callback with true or false, as to whether or not pdflatex can find ximera.cls */
function isXimeraClassFileInstalled(callback) {
    var kpsewhich  = spawn('kpsewhich', ['ximera.cls']);

    kpsewhich.on('close', function (code) {
	if (code == 0)
	    callback( true );
	else
	    callback( false );	    
    });
}

isXimeraClassFileInstalled( function(isInstalled) {
    if (!isInstalled) {
	winston.error( "Could not find a copy of ximera.cls, but xake requires that you install LaTeX and the ximeraLatex package." );
	process.exit();
    }
});

/****************************************************************/

/** @function isCurrentDirectoryGitRepository calls callback with true or false, as to whether or not we can open the current directory as a git repository */
function isCurrentDirectoryGitRepository( callback ) {
    git.Repository.open(".")
	.then(function(repo) {
	    callback( true );
	}, function(err) {
	    callback( false );
	});
}

isCurrentDirectoryGitRepository( function(isRepository) {
    if (!isRepository) {
	winston.error( "The current directory is not a git repository, but xake must be called from the ROOT DIRECTORY of a git repository." );
	process.exit();
    }
});

/****************************************************************/
var recursive = require('recursive-readdir');

var q = async.queue(function (filename, callback) {
    isClean( filename, function(err, clean) {
	if (clean) {
	    compileLatex( filename, callback );
	} else {
	    callback( "dirty" );
	}
    });
}, 1 );

// xake clean
// xake build
// xake publish

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


recursive('.', function (err, files) {
    async.filter( files, isTexDocument, function(files) {
	// BADBAD: should warn user about tex files that aren't committed
	async.filter( files, isInRepository, function(files) {
	    files.forEach( function( filename ) {
		latexDependencies( filename, function(err, dependencies) {
		    console.log( "WHEE dep for " + filename + " are " + dependencies );
		    var outputFilename = filename.replace( /.tex$/, '.html' );
		    isUpToDate( filename, outputFilename, dependencies, function(err, result) {
			console.log( "uptodate = " + result + " for " + filename );
		    });
		});
	    });
	});
    });
});


/*
recursive('.', function (err, files) {
    files.forEach( function( filename ) {
	if (filename.match( /\.tex$/ )) {
	    isInRepository( filename, function(err, inRepository) {
		if ((!err) && (inRepository)) {
		    q.push( filename, function(err) {
			if (err) {
			    winston.error( filename + ": " + err );
			} else {
			    winston.info( "Finished processing " + filename );
			}
		    });
		} else {
		    winston.info( "Skipping " + filename + " because it is not in the repository." );
		}
	    });
	}
    });
});
*/


