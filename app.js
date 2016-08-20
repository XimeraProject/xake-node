#!/usr/bin/env node

var ronin = require('ronin');

var program = ronin({
    path: __dirname,
    name: "xake",
    desc: "Xake is 'make' for Ximera",
    
    options: {
        repository: {
            type: 'string',
            alias: 'r',
            default: '.'
        },
        verbose: {
            type: 'boolean',
            alias: 'v',
            default: false
        },	
    }
});

// No more autoupdate because that breaks on SMC

console.log( "This is xake, Version " + require('./package.json').version + ".\n" );

program.run();
