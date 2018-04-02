#!/usr/bin/env node

const _ = require('lodash');
const path = require('path');
const Heroku = require('heroku-client');
const Promise = require('bluebird');
const args = require('yargs').argv;
const HerokuApp = require('./lib/heroku-app');

const action = args._[0];

const configPath = path.resolve(process.cwd(), args.config || '.mitosis.json');

const config = require(configPath);

const options = config.__mitosis;
delete options.__mitosis;

const missingArgs = _.difference(['apiKey', 'name'], Object.keys(args));
if (missingArgs.length) {
	console.error('Missing required arguments: ' + missingArgs.join(', '));
	process.exit(1);
}

const h = new Heroku({ token: args.apiKey });

const checkApp((id) => {
	return herokuClient.get(`/app-setups/${id}`)
		.then(res => {
			if (res.status === 'succeeded') return;
			return checkApp(id)
	});
})

async function appSetup() {
	await h
		.post('/app-setups', {
			body: {
				...config,
				source_blob: { url: args.tarball },
			},
		})
		.then(checkApp)
		.catch(console.error);
}

async function createReviewApp() {
	console.log('Looking for seed app...');
	const seedApp = await h.get(`/apps/${options.seed}`);
	const configVars = await h.get(`/apps/${options.seed}/config-vars`);

	const newAppName = args.name;

	const forkedExists = await h
		.get(`/apps/${newAppName}`)
		.then(() => {
			console.log('Application', newAppName, 'already exists, bailing!');
			return true;
		})
		.catch(err => false);

	if (forkedExists) {
		process.exit(0);
	}

	console.log(
		'Creating new app:',
		newAppName,
		'in region:',
		seedApp.region.name
	);

	const forkedApp = await h.post('/apps', {
		body: {
			name: newAppName,
			region: seedApp.region.id,
		},
	});

	const forked = new HerokuApp(forkedApp, h);
	await forked.updateConfigVars(configVars);

	if (config.addons) await forked.createAddons(config.addons);
	if (config.buildpacks) await forked.setBuildpacks(config.buildpacks);
	if (options.config_vars)
		await forked.setDynamicConfigVars(options.config_vars);
}

async function destroyReviewApp() {
	await h.delete(`/apps/${args.name}`);
}

async function scale() {
	const forked = new HerokuApp({ name: args.name }, h);
	if (config.formation) await forked.setFormation(config.formation);
}

let fn;
switch (action) {
	case 'appSetup':
		fn = appSetup;
		break;

	case 'create':
		fn = createReviewApp;
		break;

	case 'destroy':
		fn = destroyReviewApp;
		break;

	case 'scale':
		fn = scale;
		break;

	default:
		console.error('Action not recognized, bailing.');
		process.exit(0);
		break;
}

fn().catch(err => {
	console.log(err);
	process.exit(1);
});
