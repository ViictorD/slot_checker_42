'use strict';

const createApplication = require('./');
const simpleOauthModule = require('simple-oauth2');
const request = require('request');
const { exec } = require('child_process');
const project_slug = "libftasm";

const credentials =
{
	id: 'APP UID',
	secret: 'APP SECRET'
};

const oauth2 = simpleOauthModule.create({
	client:
	{
		id: credentials.id,
		secret: credentials.secret,
	},
	auth:
	{
		tokenHost: 'https://api.intra.42.fr',
		tokenPath: '/oauth/token',
		authorizePath: '/oauth/authorize',
	},
});

function get_token(code_value)
{
	return new Promise((resolve, reject) => {
		request.post("https://api.intra.42.fr/oauth/token",
		{
			json:
			{
				grant_type: "authorization_code",
				client_id: credentials.id,
				client_secret: credentials.secret,
				code: code_value,
				redirect_uri: "http://localhost:3000/callback",
			}
		},
		(error, response, body) => {
			if (error)
				reject(error);
			if (response.statusCode != 200)
				reject('Invalid status code <' + response.statusCode + '>');
			resolve(body);
		});
	});
}

function get_project_id(tokenObject)
{
	return new Promise((resolve, reject) => {
		request(
		{
			headers:
			{
				'Authorization': 'Bearer ' + tokenObject.access_token
			},
			uri: "https://api.intra.42.fr/v2/projects/" + project_slug,
			method: 'GET'
		},
		function (error, response, body)
		{
			if (!error && response.statusCode == 200)
			{
				var json = JSON.parse(body);
				if (json.id != null)
					resolve(json.id);
				else
					reject(error);
			}
			else
				reject(error);
		});
	});
}

createApplication(({ app, callbackUrl }) => {
	
	// Authorization uri definition
	const authorizationUri = oauth2.authorizationCode.authorizeURL({
		redirect_uri: 'http://localhost:3000/callback',
		scope: 'public projects'
	});
	
	// Initial page redirecting to 42
	app.get('/auth', (req, res) => {
		console.log(authorizationUri);
		res.redirect(authorizationUri);
	});
	
	// Callback service parsing the authorization token and asking for the access token
	app.get('/callback', async (req, res) => {
		try
		{
			const html = await get_token(req.query.code);
			var tokenObject = JSON.parse(JSON.stringify(html));
			console.log('The resulting token: ', tokenObject.access_token);
			const id = await get_project_id(tokenObject);
			look_for_slot(tokenObject, id);
			return res.status(200).send("Authentication success !<br>You can close this page.");
		}
		catch (error)
		{
			console.error('Access Token Error', error.message);
			return res.status(500).json('Authentication failed');
		}
	});
	
	app.get('/', (req, res) => {
		res.send('Hello<br><a href="/auth">Log in to 42</a>');
	});
});

async function look_for_slot(tokenObject, id)
{
	request(
	{
		headers:
		{
			'Authorization': 'Bearer ' + tokenObject.access_token
		},
		uri: "https://api.intra.42.fr/v2/projects/" + id + "/slots",
		method: 'GET'
	},
	function (error, response, body)
	{
		if (!error && response.statusCode == 200)
		{
			var json = JSON.parse(body);
			if (json[0] != null)
			{
				var now = new Date(Date.now());
				let slot_date;
				json.forEach(element => {
					slot_date = new Date(element.begin_at);
					if (now.getFullYear() == slot_date.getFullYear()
						&& now.getMonth() == slot_date.getMonth()
						&& now.getDate() == slot_date.getDate())
					{
						exec('osascript -e \'display notification "Slot found !!! gooooo !" with title "Slot checker"\'');
						console.log("Slot found today at: " + slot_date.getHours() + "h" + slot_date.getMinutes());
					}
				});
			}
			setTimeout(function(){
				console.log("Refresh...");
				look_for_slot(tokenObject, id);
			}, 10000);
		}
		else if (response.statusCode == 401)
			refresh_token(tokenObject, id);
		else
			console.log("Something went wrong on try to get slot data !");
	});
	
}

function request_refresh_token(tokenObject)
{
	return new Promise((resolve, reject) => {
		request.post("https://api.intra.42.fr/oauth/token",
		{
			json:
			{
				grant_type: "refresh_token",
				refresh_token: tokenObject.refresh_token
			}
		},
		(error, response, body) => {
			if (error)
				reject(error);
			if (response.statusCode != 200)
				reject('Invalid status code <' + response.statusCode + '>');
			resolve(body);
		});
	});
}

async function refresh_token(tokenObject, id)
{
	console.log("token expired, generate new token...");

	try
	{
		var body = await request_refresh_token(tokenObject);
		tokenObject = JSON.parse(JSON.stringify(body));
		console.log('The resulting token: ', tokenObject.access_token);
		look_for_slot(tokenObject, id);
	}
	catch (error)
	{
		console.log('Error refreshing access token: ', error.message);
	}
}
