const express = require("express");
const app = express();
const nodemailer = require("nodemailer");
const fetch = require("node-fetch");
const moment = require("moment");
const port = 8000;

const fs = require("fs");
const readline = require("readline");
const { google } = require("googleapis");
const { template } = require("./htmlTemplate");

let initialEvents = [];
let userEmail = "";

const testAccount = {
  user: "HackathonCWT@gmail.com",
  pass: "Hackathon1!CWT"
};

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: testAccount.user, // generated ethereal user
    pass: testAccount.pass // generated ethereal password
  }
});

app.use(function(req, res, next) {
  // Website you wish to allow to connect
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Request methods you wish to allow
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, PATCH, DELETE"
  );

  // Request headers you wish to allow
  res.setHeader("Access-Control-Allow-Headers", "*");

  // Set to true if you need the website to include cookies in the requests sent
  // to the API (e.g. in case you use sessions)
  res.setHeader("Access-Control-Allow-Credentials", true);

  // Pass to next layer of middleware
  next();
});

const sendEmailToUser = event => {
  fetch(
    `https://api.opencagedata.com/geocode/v1/json?q=${event.location}&language=he&key=5526524d716e49baab25983806fb3573`
  )
    .then(result => {
      return result.json();
    })
    .then(data => {
      const latitude = data.results[0].geometry.lat;
      const longitude = data.results[0].geometry.lng;
      const country_code = data.results[0].components.country_code;

      const dateFrom = moment(event.start).format("YYYY-MM-DD");
      const dateTo = moment(event.end).format("YYYY-MM-DD");

      const moreDetailsLink = `https://travel.mycwt.com/book-a-hotel#/hotel-results?checkInDate=${dateFrom}&checkOutDate=${dateTo}&countryCode=${country_code}&lat=${latitude}&lon=${longitude}&placeId=`;

      transporter.sendMail(
        {
          from: "HackathonCWT@gmail.com", // sender address
          to: userEmail, // list of receivers
          subject: "New Event Suggestions!", // Subject line
          text:
            "Hello, new meeting detected, checkout our best hotels in the nearest location", // plain text events
          html: template({
            start: event.start,
            location: event.location,
            url: moreDetailsLink
          })
        },
        function(err, info) {
          if (err) console.log(err);
          else console.log(info);
        }
      );
    });
};

// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = "token.json";

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getAccessToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES
  });
  console.log("Authorize this app by visiting this url:", authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question("Enter the code from that page here: ", code => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error("Error retrieving access token", err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), err => {
        if (err) return console.error(err);
        console.log("Token stored to", TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

/**
 * Lists the next 10 events on the user's primary calendar.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */

function listEvents(auth) {
  const calendar = google.calendar({ version: "v3", auth });
  calendar.events.list(
    {
      calendarId: "primary",
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: "updated"
    },
    (err, res) => {
      if (err) return console.log("The calendar API returned an error: " + err);
      const events = res.data.items;
      if (events.length) {
        formattedEvents = events.map((event, i) => {
          const start = event.start.dateTime || event.start.date;
          const end = event.end.dateTime || event.end.date;
          const summary = event.summary;
          const location = event.location;

          return { start, end, summary, location, created: event.created };
        });
        if (initialEvents.length !== formattedEvents.length) {
          const currentLength = initialEvents.length;

          initialEvents = formattedEvents;
          const lastEvent = formattedEvents[formattedEvents.length - 1];

          currentLength && sendEmailToUser(lastEvent);
        }
      } else {
        console.log("No upcoming events found.");
      }
    }
  );
}

const createNewTokenFile = token => {
  const expiry_date = Date.parse(new Date()) + 3600000;

  const content = `{
        "access_token": "${token}",
        "scope": "https://www.googleapis.com/auth/calendar.readonly",
        "token_type": "Bearer",
        "expiry_date": ${expiry_date}
      }
      `;

  fs.writeFile(TOKEN_PATH, content, err => {
    if (err) throw err;
    setInterval(() => {
      // Load client secrets from a local file.
      fs.readFile("credentials.json", (err, content) => {
        if (err) return console.log("Error loading client secret file:", err);
        // Authorize a client with credentials, then call the Google Calendar API.
        authorize(JSON.parse(content), listEvents);
      });
    }, 5000);
  });
};

app.post("/subscribe", (req, res) => {
  const { accesstoken, email } = req.headers;

  initialEvents = [];
  userEmail = email;

  createNewTokenFile(accesstoken);
  res.send("added!");
});

app.get("/unsubscribe", (req, res) => {
  res.send("unsubscribed!");
});

app.listen(process.env.PORT || port, () =>
  console.log(`Example app listening on port ${port}!`)
);
