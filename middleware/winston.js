var winston = require('winston');

winston.cli();

module.exports = function( next ) {
    this.global.winston = winston;
    if (this.global.verbose) {
	winston.level = 'debug';
	winston.debug( 'Verbose logging activated.' );
    }
    
    next();
};
