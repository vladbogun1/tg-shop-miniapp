> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/methods/methods/sdk-for-php.md).

# SDK for PHP

## NovaPost API SDK

> \<p>The Novapost API SDK is the official PHP SDK (Software Development Kit) for integration with the Nova Post API. With this package, you can quickly and conveniently connect such Nova Post features to your PHP application as shipment creation, parcel tracking, and other services.\</p>\
> \<strong>Features/Advantages:\</strong>\</br> \<ul>\
> &#x20; \<li>\<strong>Official Nova Post support\</strong> — guaranteed relevance, stability, and developer assistance.\</li>\
> &#x20; \<li>\<strong>Compliance with modern PHP standards\</strong> — compatibility with modern frameworks and libraries.\</li>\
> &#x20; \<li>\<strong>Flexibility and extensibility\</strong> — replace logger, HTTP client, token storage.\</li>\
> &#x20; \<li>\<strong>Easy integration\</strong> — installation via Composer, example usage included.\</li>\
> \</ul>\
> \<strong>Useful Links:\</strong>\</br> \<ul>\
> &#x20; \<li>\<a href="<https://packagist.org/packages/novadigital/novapost-api-sdk>" target="\_new">Packagist — Official Package\</a>\</li>\
> &#x20; \<li>\<a href="<https://github.com/NovaDigitalHub/novapost-api-sdk>" target="\_new">GitHub Repository\</a>\</li>\
> &#x20; \<li>\<a href="<https://github.com/NovaDigitalHub/novapost-api-sdk/issues>" target="\_new">Issue Tracker (Support & Feedback)\</a>\</li>\
> \</ul>\
> \<h2>Requirements\</h2>\
> \<ul>\
> &#x20; \<li>\
> &#x20;   \<strong>Requires\</strong> — Runtime dependencies (required for production use):\
> &#x20;   \<ul>\
> &#x20;     \<li>\<code>php \&gt;= 8.0\</code> — the package requires PHP 8.0+.\</li>\
> &#x20;     \<li>\<code>guzzlehttp/guzzle ^7.0\</code> — HTTP client for making requests.\</li>\
> &#x20;     \<li>\<code>psr/container ^2.0\</code> — compatibility with PSR dependency containers.\</li>\
> &#x20;     \<li>\<code>psr/log ^3.0\</code> — PSR-compliant logging interfaces.\</li>\
> &#x20;   \</ul>\
> &#x20; \</li>\
> \
> &#x20; \<li>\
> &#x20;   \<strong>Requires (Dev)\</strong> — Dev dependencies (needed only for development/CI):\
> &#x20;   \<ul>\
> &#x20;     \<li>\<code>phpstan/phpstan ^2.1\</code> — static analysis.\</li>\
> &#x20;     \<li>\<code>phpunit/phpunit ^9.6\</code> — unit tests.\</li>\
> &#x20;     \<li>\<code>squizlabs/php\_codesniffer ^3.13\</code> — code style/linting.\</li>\
> &#x20;     \<li>\<code>vlucas/phpdotenv ^5.6\</code> — loading environment variables from \<code>.env\</code>.\</li>\
> &#x20;   \</ul>\
> &#x20; \</li>\
> \
> &#x20; \<li>\<strong>Suggests:\</strong> None\</li>\
> &#x20; \<li>\<strong>Provides:\</strong> None\</li>\
> &#x20; \<li>\<strong>Conflicts:\</strong> None\</li>\
> &#x20; \<li>\<strong>Replaces:\</strong> None\</li>\
> \</ul>\
> \<h2>Installation\</h2>\
> To get started, install the SDK via \<a href="<https://getcomposer.org/>" target="\_new">Composer\</a> by running the following command:\
> \<pre>\<code>composer require novadigital/novapost-api-sdk\</code>\</pre>\
> \<h2>Working with the SDK\</h2>\
> \<h3>Client Initialization\</h3>\
> After installing the SDK, initialize the client using \<code>NovaPostApiFactory\</code>.\</br> This allows you to quickly create a client for interacting with the Nova Post API.\</br> Add the following example to your code:\
> \<pre>\<code> use NovaDigital\NovaPost\NovaPostApiFactory; use NovaDigital\NovaPost\Exception\ApiException; use NovaDigital\NovaPost\Resources\Division;\
> $apiKey = 'YOUR\_API\_KEY';\
> try {\
> &#x20; $novaPostApi = (new NovaPostApiFactory())($apiKey);\
> &#x20; $searchParams = \[\
> &#x20;   'textSearch' => 'berlin',\
> &#x20;   'divisionCategories' => \[Division::DIVISION\_CATEGORY\_POSTOMAT]\
> &#x20; ];\
> &#x20; $divisions = $novaPostApi->divisions()->get($searchParams);\
> } catch (ApiException $e) {\
> &#x20;   echo "API Error: " . $e->getMessage();\
> } \</code>\</pre>\
> \<h3>SDK Method Example\</h3>\
> SDK methods have the same names and parameters as the corresponding client API methods.\</br> To calculate shipment cost, use this example:\
> \<pre>\<code> try {\
> &#x20; $shipmentData = \[\
> &#x20;   // shipment calculation data\
> ]; $calculationResult = $novaPostApi->shipments()->calculate($shipmentData); } catch (ApiException $e) {\
> &#x20; echo "API Error: " . $e->getMessage();\
> } \</code>\</pre>\
> \<h2>Advanced Features\</h2>\
> \<p>\
> &#x20; The SDK allows you to replace standard services (logger, HTTP client, \
> &#x20; token storage, etc.) with your own implementations using the \
> &#x20; \<code>ContainerBuilder\</code> dependency container.\
> \</p>\
> \<p>This is useful if you need to:\</p>\
> \<ul>\
> &#x20; \<li>Integrate the SDK with your framework’s logging system.\</li>\
> &#x20; \<li>Configure an HTTP client with custom parameters or middleware.\</li>\
> &#x20; \<li>Use your own storage mechanism for JWT tokens.\</li>\
> \</ul>\
> \<p>\
> &#x20; To do this, pass your custom services to the client factory through \
> &#x20; \<strong>ContainerBuilder\</strong>.\
> \</p>\
> \<h3>Using ContainerBuilder\</h3>\
> \<p>For more flexible configuration, you can use \<code>NovaDigital\NovaPost\DI\ContainerBuilder\</code> to customize different aspects of the client.\</p>\
> \<pre>\<code> use NovaDigital\NovaPost\DI\ContainerBuilder; use NovaDigital\NovaPost\Exception\ApiException; use NovaDigital\NovaPost\NovaPostApiFactory; use NovaDigital\NovaPost\Storage\JwtTokenStorageInterface; use Psr\Log\LoggerInterface; use My\Awesome\MyLogger; use My\Awesome\DbJwtTokenStorageProvider;\
> $apiKey = 'YOUR\_API\_KEY';\
> try {\
> &#x20; $containerBuilder = (new ContainerBuilder())\
> &#x20;   ->bind(LoggerInterface::class, MyLogger::class)\
> &#x20;   ->bind(JwtTokenStorageInterface::class, DbJwtTokenStorageProvider::class);\
> \
> &#x20; $novaPostApi = (new NovaPostApiFactory())(\
> &#x20;   apiKey: $apiKey,\
> &#x20;   containerBuilder: $containerBuilder\
> &#x20; );\
> \
> &#x20; $payload = \[\
> &#x20;   // calculation parameters\
> &#x20; ];\
> \
> &#x20; $response = $novaPostApi->shipments()->calculate($payload);\
> \
> } catch (ApiException $e) {\
> &#x20;   echo 'API Error => ' . $e->getMessage() . ' (Code => ' . $e->getCode() . ')';\
> } \</code>\</pre>\
> \<h3>Available Service Overrides\</h3>\
> With \<strong>ContainerBuilder\</strong>, you can override the following services:\
> \<table>\
> &#x20; \<thead>\
> &#x20;   \<tr>\<th>Service\</th>\<th>Purpose\</th>\</tr>\
> &#x20; \</thead>\
> &#x20; \<tbody>\
> &#x20;   \<tr>\<td>Psr\Log\LoggerInterface\</td>\<td>Custom logging\</td>\</tr>\
> &#x20;   \<tr>\<td>Psr\Http\Client\ClientInterface\</td>\<td>Custom HTTP client configuration\</td>\</tr>\
> &#x20;   \<tr>\<td>NovaDigital\NovaPost\Storage\JwtTokenStorageInterface\</td>\<td>Custom JWT token storage\</td>\</tr>\
> &#x20;   \<tr>\<td>NovaDigital\NovaPost\Http\ResponseHandlerInterface\</td>\<td>Custom response processing\</td>\</tr>\
> &#x20;   \<tr>\<td>NovaDigital\NovaPost\Http\RetryHandlerInterface\</td>\<td>Custom retry logic\</td>\</tr>\
> &#x20; \</tbody>\
> \</table>\
> \<h3>PSR Compliance\</h3>\
> The \<strong>NovaPost API SDK\</strong> complies with the following PSR standards, ensuring compatibility, modern design, and high code quality:\
> \<table>\
> &#x20; \<thead>\
> &#x20;   \<tr>\
> &#x20;     \<th>Standard\</th>\
> &#x20;     \<th>Purpose\</th>\
> &#x20;   \</tr>\
> &#x20; \</thead>\
> &#x20; \<tbody>\
> &#x20;   \<tr>\
> &#x20;     \<td>\<strong>PSR-4: Autoloader\</strong>\</td>\
> &#x20;     \<td>For class autoloading\</td>\
> &#x20;   \</tr>\
> &#x20;   \<tr>\
> &#x20;     \<td>\<strong>PSR-11: Container Interface\</strong>\</td>\
> &#x20;     \<td>For a flexible dependency container\</td>\
> &#x20;   \</tr>\
> &#x20;   \<tr>\
> &#x20;     \<td>\<strong>PSR-3: Logger Interface\</strong>\</td>\
> &#x20;     \<td>Allows using any compatible logger\</td>\
> &#x20;   \</tr>\
> &#x20;   \<tr>\
> &#x20;     \<td>\<strong>PSR-7: HTTP Message Interface\</strong>\</td>\
> &#x20;     \<td>Used for all API requests and responses\</td>\
> &#x20;   \</tr>\
> &#x20;   \<tr>\
> &#x20;     \<td>\<strong>PSR-18: HTTP Client\</strong>\</td>\
> &#x20;     \<td>For sending HTTP requests\</td>\
> &#x20;   \</tr>\
> &#x20;   \<tr>\
> &#x20;     \<td>\<strong>PSR-17: HTTP Factories\</strong>\</td>\
> &#x20;     \<td>For creating PSR-7 messages\</td>\
> &#x20;   \</tr>\
> &#x20;   \<tr>\
> &#x20;     \<td>\<strong>PSR-12: Extended Coding Standard\</strong>\</td>\
> &#x20;     \<td>For coding style\</td>\
> &#x20;   \</tr>\
> &#x20; \</tbody>\
> \</table>\
> Following these standards makes the SDK reliable, predictable, and easy to integrate into any modern PHP application.

```json
{"openapi":"3.0.0","info":{"title":"API Nova Post","version":"1.0.0"},"tags":[{"name":"SDK"}],"servers":[{"description":"sandbox","url":"https://api-stage.novapost.com/v.1.0/"},{"description":"production","url":"https://api.novapost.com/v.1.0/"}],"paths":{"/sdk/php":{"patch":{"tags":["SDK"],"summary":"NovaPost API SDK","description":"<p>The Novapost API SDK is the official PHP SDK (Software Development Kit) for integration with the Nova Post API. With this package, you can quickly and conveniently connect such Nova Post features to your PHP application as shipment creation, parcel tracking, and other services.</p>\n<strong>Features/Advantages:</strong></br> <ul>\n  <li><strong>Official Nova Post support</strong> — guaranteed relevance, stability, and developer assistance.</li>\n  <li><strong>Compliance with modern PHP standards</strong> — compatibility with modern frameworks and libraries.</li>\n  <li><strong>Flexibility and extensibility</strong> — replace logger, HTTP client, token storage.</li>\n  <li><strong>Easy integration</strong> — installation via Composer, example usage included.</li>\n</ul>\n<strong>Useful Links:</strong></br> <ul>\n  <li><a href=\"https://packagist.org/packages/novadigital/novapost-api-sdk\" target=\"_new\">Packagist — Official Package</a></li>\n  <li><a href=\"https://github.com/NovaDigitalHub/novapost-api-sdk\" target=\"_new\">GitHub Repository</a></li>\n  <li><a href=\"https://github.com/NovaDigitalHub/novapost-api-sdk/issues\" target=\"_new\">Issue Tracker (Support & Feedback)</a></li>\n</ul>\n<h2>Requirements</h2>\n<ul>\n  <li>\n    <strong>Requires</strong> — Runtime dependencies (required for production use):\n    <ul>\n      <li><code>php &gt;= 8.0</code> — the package requires PHP 8.0+.</li>\n      <li><code>guzzlehttp/guzzle ^7.0</code> — HTTP client for making requests.</li>\n      <li><code>psr/container ^2.0</code> — compatibility with PSR dependency containers.</li>\n      <li><code>psr/log ^3.0</code> — PSR-compliant logging interfaces.</li>\n    </ul>\n  </li>\n\n  <li>\n    <strong>Requires (Dev)</strong> — Dev dependencies (needed only for development/CI):\n    <ul>\n      <li><code>phpstan/phpstan ^2.1</code> — static analysis.</li>\n      <li><code>phpunit/phpunit ^9.6</code> — unit tests.</li>\n      <li><code>squizlabs/php_codesniffer ^3.13</code> — code style/linting.</li>\n      <li><code>vlucas/phpdotenv ^5.6</code> — loading environment variables from <code>.env</code>.</li>\n    </ul>\n  </li>\n\n  <li><strong>Suggests:</strong> None</li>\n  <li><strong>Provides:</strong> None</li>\n  <li><strong>Conflicts:</strong> None</li>\n  <li><strong>Replaces:</strong> None</li>\n</ul>\n<h2>Installation</h2>\nTo get started, install the SDK via <a href=\"https://getcomposer.org/\" target=\"_new\">Composer</a> by running the following command:\n<pre><code>composer require novadigital/novapost-api-sdk</code></pre>\n<h2>Working with the SDK</h2>\n<h3>Client Initialization</h3>\nAfter installing the SDK, initialize the client using <code>NovaPostApiFactory</code>.</br> This allows you to quickly create a client for interacting with the Nova Post API.</br> Add the following example to your code:\n<pre><code> use NovaDigital\\NovaPost\\NovaPostApiFactory; use NovaDigital\\NovaPost\\Exception\\ApiException; use NovaDigital\\NovaPost\\Resources\\Division;\n$apiKey = 'YOUR_API_KEY';\ntry {\n  $novaPostApi = (new NovaPostApiFactory())($apiKey);\n  $searchParams = [\n    'textSearch' => 'berlin',\n    'divisionCategories' => [Division::DIVISION_CATEGORY_POSTOMAT]\n  ];\n  $divisions = $novaPostApi->divisions()->get($searchParams);\n} catch (ApiException $e) {\n    echo \"API Error: \" . $e->getMessage();\n} </code></pre>\n<h3>SDK Method Example</h3>\nSDK methods have the same names and parameters as the corresponding client API methods.</br> To calculate shipment cost, use this example:\n<pre><code> try {\n  $shipmentData = [\n    // shipment calculation data\n]; $calculationResult = $novaPostApi->shipments()->calculate($shipmentData); } catch (ApiException $e) {\n  echo \"API Error: \" . $e->getMessage();\n} </code></pre>\n<h2>Advanced Features</h2>\n<p>\n  The SDK allows you to replace standard services (logger, HTTP client, \n  token storage, etc.) with your own implementations using the \n  <code>ContainerBuilder</code> dependency container.\n</p>\n<p>This is useful if you need to:</p>\n<ul>\n  <li>Integrate the SDK with your framework’s logging system.</li>\n  <li>Configure an HTTP client with custom parameters or middleware.</li>\n  <li>Use your own storage mechanism for JWT tokens.</li>\n</ul>\n<p>\n  To do this, pass your custom services to the client factory through \n  <strong>ContainerBuilder</strong>.\n</p>\n<h3>Using ContainerBuilder</h3>\n<p>For more flexible configuration, you can use <code>NovaDigital\\NovaPost\\DI\\ContainerBuilder</code> to customize different aspects of the client.</p>\n<pre><code> use NovaDigital\\NovaPost\\DI\\ContainerBuilder; use NovaDigital\\NovaPost\\Exception\\ApiException; use NovaDigital\\NovaPost\\NovaPostApiFactory; use NovaDigital\\NovaPost\\Storage\\JwtTokenStorageInterface; use Psr\\Log\\LoggerInterface; use My\\Awesome\\MyLogger; use My\\Awesome\\DbJwtTokenStorageProvider;\n$apiKey = 'YOUR_API_KEY';\ntry {\n  $containerBuilder = (new ContainerBuilder())\n    ->bind(LoggerInterface::class, MyLogger::class)\n    ->bind(JwtTokenStorageInterface::class, DbJwtTokenStorageProvider::class);\n\n  $novaPostApi = (new NovaPostApiFactory())(\n    apiKey: $apiKey,\n    containerBuilder: $containerBuilder\n  );\n\n  $payload = [\n    // calculation parameters\n  ];\n\n  $response = $novaPostApi->shipments()->calculate($payload);\n\n} catch (ApiException $e) {\n    echo 'API Error => ' . $e->getMessage() . ' (Code => ' . $e->getCode() . ')';\n} </code></pre>\n<h3>Available Service Overrides</h3>\nWith <strong>ContainerBuilder</strong>, you can override the following services:\n<table>\n  <thead>\n    <tr><th>Service</th><th>Purpose</th></tr>\n  </thead>\n  <tbody>\n    <tr><td>Psr\\Log\\LoggerInterface</td><td>Custom logging</td></tr>\n    <tr><td>Psr\\Http\\Client\\ClientInterface</td><td>Custom HTTP client configuration</td></tr>\n    <tr><td>NovaDigital\\NovaPost\\Storage\\JwtTokenStorageInterface</td><td>Custom JWT token storage</td></tr>\n    <tr><td>NovaDigital\\NovaPost\\Http\\ResponseHandlerInterface</td><td>Custom response processing</td></tr>\n    <tr><td>NovaDigital\\NovaPost\\Http\\RetryHandlerInterface</td><td>Custom retry logic</td></tr>\n  </tbody>\n</table>\n<h3>PSR Compliance</h3>\nThe <strong>NovaPost API SDK</strong> complies with the following PSR standards, ensuring compatibility, modern design, and high code quality:\n<table>\n  <thead>\n    <tr>\n      <th>Standard</th>\n      <th>Purpose</th>\n    </tr>\n  </thead>\n  <tbody>\n    <tr>\n      <td><strong>PSR-4: Autoloader</strong></td>\n      <td>For class autoloading</td>\n    </tr>\n    <tr>\n      <td><strong>PSR-11: Container Interface</strong></td>\n      <td>For a flexible dependency container</td>\n    </tr>\n    <tr>\n      <td><strong>PSR-3: Logger Interface</strong></td>\n      <td>Allows using any compatible logger</td>\n    </tr>\n    <tr>\n      <td><strong>PSR-7: HTTP Message Interface</strong></td>\n      <td>Used for all API requests and responses</td>\n    </tr>\n    <tr>\n      <td><strong>PSR-18: HTTP Client</strong></td>\n      <td>For sending HTTP requests</td>\n    </tr>\n    <tr>\n      <td><strong>PSR-17: HTTP Factories</strong></td>\n      <td>For creating PSR-7 messages</td>\n    </tr>\n    <tr>\n      <td><strong>PSR-12: Extended Coding Standard</strong></td>\n      <td>For coding style</td>\n    </tr>\n  </tbody>\n</table>\nFollowing these standards makes the SDK reliable, predictable, and easy to integrate into any modern PHP application.","responses":{"200":{"description":"OK"}}}}}}
```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/methods/methods/sdk-for-php.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
