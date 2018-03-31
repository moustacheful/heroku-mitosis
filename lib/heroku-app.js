const Promise = require('bluebird');
const _ = require('lodash');

const PROVISION_CHECK_DELAY = 10000;

module.exports = class HerokuApp {
	constructor(app, client) {
		this.app = app;
		this.client = client;
		this._basePath = `/apps/${this.app.name}`;

		this.updateConfigVars = this.updateConfigVars.bind(this);
		this.createAddons = this.createAddons.bind(this);
		this.areAddonsProvisioned = this.areAddonsProvisioned.bind(this);
		this.setDynamicConfigVars = this.setDynamicConfigVars.bind(this);
		this.setFormation = this.setFormation.bind(this);
	}

	async updateConfigVars(config) {
		console.log('Setting config vars', Object.keys(config));
		return this.client.patch(`${this._basePath}/config-vars`, { body: config });
	}

	async createAddons(addons) {
		console.log('Creating addons');
		const promises = addons.map(addonPlan => {
			console.log('Creating addon:', addonPlan);

			return this.client.post(`${this._basePath}/addons`, {
				body: { plan: addonPlan },
			});
		});

		return Promise.all(promises)
			.delay(PROVISION_CHECK_DELAY)
			.then(this.areAddonsProvisioned);
	}

	areAddonsProvisioned() {
		console.log('Checking for addons status...');
		return this.client.get(`${this._basePath}/addons`).then(addons => {
			if (
				addons.every(addon => {
					return addon.state === 'provisioned';
				})
			) {
				console.log('All addons provisioned!');
				return true;
			}

			return Promise.delay(PROVISION_CHECK_DELAY).then(
				this.areAddonsProvisioned
			);
		});
	}

	setBuildpacks(buildpacks) {
		buildpacks = buildpacks.map((url, ordinal) => ({
			buildpack: url,
			ordinal,
		}));

		console.log('Setting buildpacks: \n', buildpacks);

		return this.client
			.put(`${this._basePath}/buildpack-installations`, {
				body: {
					updates: buildpacks,
				},
			})
			.catch(console.log);
	}

	async setDynamicConfigVars(templateConfig) {
		console.log('Setting derived config vars');
		const cfg = await this.client.get(`${this._basePath}/config-vars`);
		const addons = await this.client.get(`${this._basePath}/addons`);

		const data = {
			...cfg,
			...addons.reduce((acc, addon) => {
				return _.set(
					acc,
					`addons.${_.snakeCase(addon.addon_service.name)}`,
					cfg[addon.config_vars[0]]
				);
			}, {}),
		};

		const result = _.reduce(
			templateConfig,
			(acc, templateStr, key) => {
				const template = _.template(templateStr);

				try {
					acc[key] = template(data);
				} catch (err) {
					console.log(err.message);
				}

				return acc;
			},
			{}
		);

		return this.updateConfigVars(result);
	}

	setFormation(formation) {
		console.log('Setting formation');
		formation = _.reduce(
			formation,
			(acc, definition, type) => {
				acc.push({
					type,
					...definition,
				});

				return acc;
			},
			[]
		);
		console.log(formation);
		return this.client.patch(`${this._basePath}/formation`, {
			body: { updates: formation },
		});
	}
};
