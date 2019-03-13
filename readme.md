# Heroku Mitosis

A package for creating copies of heroku applications through the CLI, using [Heroku's app schema](https://devcenter.heroku.com/articles/app-json-schema) as a base.

Designed to be used mainly as a part of your CI pipeline to create review apps.

## Tasks

### `setup` task

Sets up or updates an application

#### Arguments

| Name        | Description                                                       |
| ----------- | ----------------------------------------------------------------- |
| `--tarball` | The public tarball url that contains the application source code. |
| `--name`    | The application name.                                             |
| `--apiKey`  | Heroku API key                                                    |

#### Description

##### If the application exists

1. Updates the application using the tarball, outputting the deployment logs.

##### If the application does not exist

1. Creates an application based on the `app.json` on the root of the application.
2. Waits for the app to be fully provisioned, outputting the deployment logs.
3. Adds collaborators, if any. (see: [Custom app.json properties](#custom-appjson-properties))
4. Adds the application to a particular pipeline stage. (see: [Custom app.json properties](#custom-appjson-properties))

---

### `destroy` task

Destroys an application by its name

#### Arguments

| Name       | Description           |
| ---------- | --------------------- |
| `--name`   | The application name. |
| `--apiKey` | Heroku API key        |

## Example - GitLab CI

In here we use some of the readily available CI variables: `CI_BUILD_REF_SLUG`, `CI_BUILD_REF_NAME`, plus some user defined
variables: `GITLAB_TOKEN` and `HEROKU_API_KEY`. More [here](https://docs.gitlab.com/ee/ci/review_apps/).

This will create an app with the name of the branch as the application name. Using a prefix would be recommended. Keep in mind Heroku limits the maximum amount of characters on the application name (to 32, apparently), and this is not handled by this package.

```yaml
review:
  stage: review
  when: manual # or auto
  script:
    - npx heroku-mitosis setup --name=$CI_BUILD_REF_SLUG --tarball=https://gitlab.com/namespace/project/repository/$CI_BUILD_REF_SLUG/archive.tar?private_token=$GITLAB_TOKEN --apiKey=$HEROKU_API_KEY
  environment:
    name: review/$CI_BUILD_REF_NAME
    url: https://$CI_BUILD_REF_SLUG.herokuapp.com
    on_stop: stop_review
  only:
    - branches
  except:
    - master
    - development

stop_review:
  stage: review
  script:
    - npx heroku-mitosis destroy --name=$CI_BUILD_REF_SLUG --apiKey=$HEROKU_API_KEY
  when: manual
  environment:
    name: review/$CI_BUILD_REF_NAME
    action: stop
```

## Custom app.json properties

There are a few custom properties that are not part of the app.json schema that are under the `__mitosis` namespace. These add automation of commonly used Heroku features. Currently, these are:

```javascript
  "__mitosis": {
    "pipeline": {
      // Adds this app to an already existent pipeline named foo. The Heroku account must have access to it.
      "name": "foo",

      // The stage coupling in the pipeline this app is added to. With review, it behaves as it would with the github integration. Possible values: :"test", "review", "development", "staging", "production"
      "stage": "review"
    },
    "collaborators": [
      // You may add additional users that will have access to this app. The users must already exist in Heroku.
      "foo@company.com",
      "bar@company.com"
    ],
    "features": [
      // Additional Heroku features can be enabled here. Possible features should be available here: https://devcenter.heroku.com/categories/labs
      "runtime-dyno-metadata"
    ]
  }
```

##### Notes

Remember to clean up your unused environments, be a good sport and don't abuse heroku's free resources!
