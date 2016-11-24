var spawn = require('child_process').spawn;

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

module.exports = function( next ) {
    isXimeraClassFileInstalled(function(isInstalled) {
	if (!isInstalled) {
	    throw new Error( "Could not find a copy of ximera.cls, but xake requires that you install the ximeraLatex package." );
	}

	next();
    });
};
