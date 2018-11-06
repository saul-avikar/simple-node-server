/*
	Expects the following files:
		email.json
			{
				"to": "foo@bar.com",
				"host": "smtp.test.test",
				"port": 123,
				"auth": {
					"user": "foo",
					"pass": "bar"
				}
			}
		recaptcha.json
			{
				"publicKey": "YOUR RECAPTCHA SITE KEY",
				"privateKey": "YOUR RECAPTCHA SECRET"
			}
*/
const greenlock = require("greenlock-express");
const emailSettings = require("./email.json");
const app = require("./app.js");

// Lets Encrypt
const glx = greenlock.create({
	// set to https://acme-v02.api.letsencrypt.org/directory in production
	version: "draft-11",
	server: "https://acme-staging-v02.api.letsencrypt.org/directory",
	configDir: "/home/saul/.config/acme",
	approveDomains: ["avikar.io", "www.avikar.io", "mail.avikar.io"],
	agreeTos: true,
	email: emailSettings.to,
	app
});

// Start the server
const server = glx.listen(80, 443);
