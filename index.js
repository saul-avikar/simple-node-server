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
		certs.json
			{
				"privatekey": "/etc/letsencrypt/live/www.avikar.io/privkey.pem",
				"certificate": "/etc/letsencrypt/live/www.avikar.io/cert.pem"
			}
		recaptcha.json
			{
				"publicKey": "YOUR RECAPTCHA SITE KEY",
				"privateKey": "YOUR RECAPTCHA SECRET"
			}
*/

const express = require("express");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const reCAPTCHA = require("recaptcha2");
const greenlock = require("greenlock-express");
const certLocations = require("./certs.json");
const emailSettings = require("./email.json");
const recaptchaKeys = require("./recaptcha.json");

const app = express();
const port = 80;

// Lets Encrypt
const approveDomains = (opts, certs, cb) => {
	if (certs) {
		opts.domains = certs.altnames;
	}

	cb(null, { options: opts, certs: certs });
}

const lex = greenlock.create({
	// set to https://acme-v01.api.letsencrypt.org/directory in production
	server: "staging",
	challenges: { "http-01": require("le-challenge-fs").create({ webrootPath: "/tmp/acme-challenges" }) },
	store: require("le-store-certbot").create({ webrootPath: "/tmp/acme-challenges" }),
	approveDomains: approveDomains
});

// Google reCAPTCHA
recaptcha = new reCAPTCHA({
	siteKey: recaptchaKeys.publicKey,
	secretKey: recaptchaKeys.privateKey
});

// Mail transporter
const transporter = nodemailer.createTransport({
	host: emailSettings.host,
	port: emailSettings.port,
	auth: emailSettings.auth,
	secure: false // Still uses STARTTLS
});

// Attempts to fetch the cert
const fetchCert = (location) => {
	let cert = null;

	try {
		cert = fs.readFileSync(location);
	} catch (e) {
		cert = null;
	}

	return cert;
};

// Disables chaching
const noCache = (res) => {
	res.header("Cache-Control", "private, no-cache, no-store, must-revalidate");
	res.header("Expires", "-1");
	res.header("Pragma", "no-cache");
};

// Configure body-parser
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const privateKey = fetchCert(certLocations.privatekey);
const certificate = fetchCert(certLocations.certificate);

// Run servers if https, otherwise run a test server
if (privateKey && certificate) {
	// Redirect http to https
	app.use ((req, res, next) => {
		req.secure ? next() : res.redirect(`https://${req.headers.host}${req.url}`);
	});

	http.createServer(app).listen(80, () => {
		console.log("http to https redirection running on port: 80");
	});

	https.createServer(lex.httpsOptions, lex.middleware(app)).listen(443, () => {
		console.log("https server running on port: 443");
	});
} else {
	http.createServer(app).listen(port, () => {
		console.log(`http server running on port: ${port}`);
	});
}

// Chache control middleware
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

// Used for cert generation
app.use("/.well-known", express.static(path.join(__dirname, "/../.well-known")));

//handle email requests.
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

// Server the built files
app.use(express.static(path.join(__dirname, "/../dist")));

// Route any 404 back for vue router to handle
app.get("/*", (req, res) => {
	noCache(res);
	res.sendFile(path.join(__dirname, "/../dist/index.html"));
});
