var Command = require('ronin').Command;
var winston = require('winston');



var PublishCommand = module.exports = Command.extend({
    use: ['winston', 'logged-in', 'find-repository-root'],
    
    desc: 'Publish the compiled content to Ximera',

    options: {
    },

    run: function (key, secret) {
	var global = this.global;
	winston = global.winston;

	winston.info("Publishing.");
    }
});
