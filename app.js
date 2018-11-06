const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");
const reCAPTCHA = require("recaptcha2");
const emailSettings = require("./email.json");
const recaptchaKeys = require("./recaptcha.json");

const app = express();

// Disable cache
const noCache = (res) => {
	res.header("Cache-Control", "private, no-cache, no-store, must-revalidate");
	res.header("Expires", "-1");
	res.header("Pragma", "no-cache");
};

// Mail transporter
const transporter = nodemailer.createTransport({
	host: emailSettings.host,
	port: emailSettings.port,
	auth: emailSettings.auth,
	secure: false // Still uses STARTTLS
});

// Google reCAPTCHA
recaptcha = new reCAPTCHA({
	siteKey: recaptchaKeys.publicKey,
	secretKey: recaptchaKeys.privateKey
});

// bodyParser middleware for parsing email post reqs
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Cache control
app.use((req, res, next) => {
	const urlArr = req.url.split("/");

	if (urlArr[0] === "static") {
		res.setHeader("Cache-Control", "max-age=300, must-revalidate");
	} else if (
		urlArr[urlArr.length - 1] === "index.html" ||
		urlArr[urlArr.length - 1] === "service-worker.js"
	) {
		noCache(res);
	}

	next();
});

// Handle email
app.post("/email", (req, res) => {
	if (!req.body.response) {
		return res.end(JSON.stringify({
			code: 0,
			error: "Missing ReCAPTCHA key."
		}));
	}

	recaptcha.validate(req.body.response).then(() => {
		transporter.sendMail({
			from: `${req.body.name}, <${req.body.email}>`,
			to: emailSettings.to,
			subject: `Web submission from ${req.body.name}`,
			text: req.body.message
		}, (err, info) => {
			if (err) {
				console.log(err);

				return res.end(JSON.stringify({
					code: 0,
					error: err
				}));
			}

			return res.end(JSON.stringify({code: 1}));
		});
	}).catch(err => {
		return res.end(JSON.stringify({
			code: 0,
			error: err
		}));
	});
});

// Serve the built files
app.use(express.static(path.join(__dirname, "/../dist")));

// Route any 404 back for vue router to handle
app.get("/*", (req, res) => {
	noCache(res);
	res.sendFile(path.join(__dirname, "/../dist/index.html"));
});

// DO NOT DO app.listen() unless we're testing this directly
if (require.main === module) { app.listen(3000); }

// Instead do export the app:
module.exports = app;
