#!/usr/bin/env node
const _ = require('lodash');
const path = require('path');
const https = require('https');
const args = require('yargs').argv;
const Heroku = require('heroku-client');
const Promise = require('bluebird');

const checkArgs = (required) => {
  const missing = _.difference(required, Object.keys(args));
  if (!missing.length) return true;

  throw new Error(`Missing required arguments: ${missing.join(', ')}`);
};

const heroku = new Heroku({ token: args.apiKey });
const CHECK_DELAY = 10000;
const action = args._[0];
const configPath = path.resolve(process.cwd(), 'app.json');
let config, options;

try {
  config = require(configPath);
  options = config.__mitosis;
  delete config.__mitosis;
} catch (err) {
  throw new Error(
    'An app.json must be present and valid to be able to setup apps with heroku'
  );
}

const Mitosis = {
  logStream(url) {
    return new Promise((resolve, reject) => {
      https
        .get(url, (res) => {
          res.on('data', (chunk) => {
            process.stdout.write(chunk.toString());
          });

          res.on('end', (response) => resolve(true));
        })
        .on('error', (error) => {
          console.error(error);
          reject(error);
        });
    });
  },

  updateApp(name, tarball) {
    return heroku
      .post(`/apps/${name}/builds`, {
        body: { source_blob: { url: tarball } },
      })
      .then((build) => Mitosis.logStream(build.output_stream_url));
  },

  async createApp(name, tarball) {
    console.log(`Setting up app: ${name}`);

    const checkApp = (id) => {
      console.log('Checking app status...');

      return heroku.get(`/app-setups/${id}`).then((res) => {
        if (res.status === 'failed') return Promise.reject(res.failure_message);

        if (res.build && res.build.output_stream_url)
          return Mitosis.logStream(res.build.output_stream_url);

        return Promise.delay(CHECK_DELAY).then(() => checkApp(id));
      });
    };

    await heroku
      .post('/app-setups', {
        body: {
          app: { name },
          source_blob: { url: tarball },
        },
      })
      .then(res => checkApp(res.id));

    if (options.collaborators) {
      console.log(`Adding ${options.collaborators.length} collaborator(s)`);
      await Promise.map(options.collaborators, user =>
        heroku
          .post(`/apps/${name}/collaborators`, {
            body: {
              silent: true,
              user,
            },
          })
          .catch(err => console.log(err.body.message))
      );
    }

    if (options.pipeline) {
      console.log(
        `Attaching to '${options.pipeline.stage}' on pipeline '${
          options.pipeline.name
        }'`
      );
      const pipeline = await heroku.get(`/pipelines/${options.pipeline.name}`);

      await heroku
        .post('/pipeline-couplings', {
          body: {
            app: name,
            pipeline: pipeline.id,
            stage: options.pipeline.stage,
          },
        })
        .catch(err => console.log(err.body.message));
    }

    return true;
  },
};

const actions = {
  async setup() {
    checkArgs(['tarball', 'name']);

    const appExists = await heroku
      .get(`/apps/${args.name}`)
      .then(() => true)
      .catch(() => false);

    if (appExists) {
      await Mitosis.updateApp(args.name, args.tarball);
      return console.log(`App '${args.name}' updated`);
    }

    await Mitosis.createApp(args.name, args.tarball);
    return console.log(`App '${args.name}' created`);
  },

  destroy() {
    checkArgs(['name']);

    return heroku.delete(`/apps/${args.name}`);
  },
};

if (!(action in actions)) {
  console.error('Action not recognized, bailing.');
  process.exit(1);
}

checkArgs(['apiKey']);

actions[action]()
  .then(() => {
    console.log(`Action ${action} succeeded`);
    process.exit(0);
  })
  .catch((err) => {
    console.log(`Action ${action} failed:`);
    console.log(err);
    process.exit(1);
  });
