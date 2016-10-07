var http = require('http');
var Slack = require('slack-node');
var fs = require('fs');
var jsdiff = require('diff');

var updateInterval; // seconds
var webhookURL = '';
var slackbotName = 'slacktivity-bot';
var slackbotIcon = ':radio:';

var server = require('./routes.js');
server.start();

slack = new Slack();

//A little debugging module I've built. I might add onto later, but for now it
var debug = require('./debug.js');
debug.on();

var monitor; //handles setInterval

//At start, gets and sets the configuration details.
server.query('SELECT * FROM "config"', function(result) {

    updateInterval = result.rows[0].update_interval;
    webhookURL = result.rows[0].webhook_url;

    slack.setWebhook(webhookURL);

    slackbotName = result.rows[0].slackbot_name;

    monitor = setInterval(function(){ checkForChanges(); }, (updateInterval*1000));

});

function checkForChanges(){
  debug.log('listening for changes and checking every: ' + updateInterval + ' seconds');

  server.query('SELECT * FROM "monitored_sites"', function(result) {

    var sites = result.rows;

    for(var i=0; i<sites.length; i++){ //check each site for changes
      checkSingleSiteForChanges(sites[i]);
    }

  });

}

function checkSingleSiteForChanges(site) {

    debug.log('Checking site for changes!');
    download(site.url, function(downloadContents) {
      if((downloadContents != site.then) && (site.then != null)){
        //When there's a search term, only show a notification if that term is found.
        if((site.search_term == null) || (site.search_term != null && downloadContents.includes(site.search_term))){
          debug.log('Change Detected!');
          var changes = jsdiff.diffWords(site.then, downloadContents);
          sendChangeNotification(changes,site);
        }
      }
      else{
        debug.log('No change detected.')
      }

      //Set the last checked value in the DB to what we just got.
      var query = 'UPDATE "monitored_sites" SET "then" = \''+downloadContents+'\' WHERE id=' + site.id;
      debug.log(query);
      server.query(query,function(result){});
    });


}

function sendChangeNotification(changes, site) {

    debug.log(changes)

    var message = "Heads up! Something has changed at: " + site.url;
    if (site.search_term != null || site.search_term!= '') {
        message = "Heads up! Your search term (" + site.search_term + ") was found at: " + site.url;
    }

    slack.webhook({
        channel: site.slack_channel, //This must be prefixed with '#'
        username: slackbotName,
        icon_emoji: slackbotIcon,
        text: message,
        attachments: [
        {
            "fallback": "ReferenceError - UI is not defined: https://honeybadger.io/path/to/event/",
            "text": "Search Term: `internship`, was found at <http://localhost:3000>\nHere's a rundown of the changes:",
            "fields": [
                {
                    "title": "Added",
                    "value": "Awesome Project",
                    "short": false
                },
                {
                    "title": "Removed",
                    "value": "production",
                    "short": false
                }
            ],"mrkdwn_in": [
                "text",
                "pretext"
            ],
            "color": "#183D7F"
        }
    ]
    }, function(err, response) {
        debug.log(response);
    });

}

// Utility function that downloads a URL and invokes callback with the data.
// Source credit to John Robinson @ http://www.storminthecastle.com/2013/08/25/use-node-js-to-extract-data-from-the-web-for-fun-and-profit/
function download(url, callback) {
    http.get(url, function(res) {
        var data = "";
        res.on('data', function(chunk) {
            data += chunk;
        });
        res.on("end", function() {
            callback(data);
        });
    }).on("error", function() {
        callback(null);
    });
}


//setUpdateInterval and setSlackDetails are used by routes to update while the app is running.
exports.setSlackDetails = function(newURL,newBotName){
  webhookURL = newURL;
  slack.setWebhook(webhookURL);
  slackbotName = newBotName;

}

exports.setUpdateInterval = function(newInterval){
  debug.log('OLD interval: ' + updateInterval + ' seconds. NEW interval: ' + newInterval + ' seconds.');
  clearInterval(monitor);
  updateInterval = newInterval;
  monitor = setInterval(function(){ checkForChanges(); }, (updateInterval*1000));
}
