#!/usr/bin/env node

var ronin = require('ronin');

var program = ronin({
    path: __dirname,
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

program.autoupdate(function () {
    console.log( "This is xake, Version " + require('./package.json').version + "." );
    
    program.run();
});
