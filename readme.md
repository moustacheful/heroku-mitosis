# Heroku Mitosis
A package for creating copies of heroku applications through the CLI, using [Heroku's app schema](https://devcenter.heroku.com/articles/app-json-schema) as a base. 

Designed to be used mainly as a part of your CI pipeline to create review apps.


## Tasks

### `setup` task
Sets up or updates an application

#### Arguments 

| Name       | Description                                                       |
| ---------- | ----------------------------------------------------------------- |
| `--tarball`| The public tarball url that contains the application source code. |
| `--name`   | The application name.                                             |
| `--apiKey` | Heroku API key                                                    |

#### Description

##### If the application exists
1. Updates the application using the tarball, outputting the deployment logs.

##### If the application does not exist
1. Creates an application based on the `app.json` on the root of the application.
2. Waits for the app to be fully provisioned, outputting the deployment logs.
3. Adds collaborators, if any.
4. Adds the application to a particular pipeline stage.

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