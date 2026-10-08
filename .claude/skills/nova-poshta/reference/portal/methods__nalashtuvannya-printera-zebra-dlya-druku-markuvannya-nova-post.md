> For the complete documentation index, see [llms.txt](https://api-portal.novapost.com/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://api-portal.novapost.com/methods/nalashtuvannya-printera-zebra-dlya-druku-markuvannya-nova-post.md).

# Налаштування принтера Zebra для друку маркування Nova Post

{% hint style="info" %}
Для коректного друку маркування Nova Post на принтері **Zebra** необхідно попередньо завантажити та встановити на принтер спеціальні шрифти.
{% endhint %}

### Перед початком

Переконайтеся, що:

* принтер **Zebra** підключено до комп’ютера та він доступний для налаштування;
* на комп’ютері встановлено **Zebra Setup Utilities**;
* завантажено файли шрифтів:

{% columns %}
{% column %}
{% file src="/files/qSk7kxF5r7nTI1OV2eTS" %}
{% endcolumn %}

{% column %}
{% file src="/files/QjZaIqIsQ8ZPnttak40O" %}
{% endcolumn %}
{% endcolumns %}

### Встановлення шрифтів

{% stepper %}
{% step %}

#### Виберіть принтер у Zebra Setup Utilities

Відкрийте **Zebra Setup Utilities** та виберіть принтер, який використовується для друку маркування Nova Post.

<figure><img src="https://331292232-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F4kHbNqhgtrlGjZyxZiDa%2Fuploads%2Fz1ifBSZL2ykO96HVZyIL%2Fimage%201.png?alt=media&amp;token=0bd066d9-f0fa-4e1f-81e7-378e87ba10d3" alt=""><figcaption></figcaption></figure>
{% endstep %}

{% step %}

#### Відкрийте Printer Tools

Натисніть **Open Printer Tools**.

<figure><img src="https://331292232-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F4kHbNqhgtrlGjZyxZiDa%2Fuploads%2FsIMda6hUr23bB6SUwXiP%2Fimage%202.png?alt=media&amp;token=f291d507-fc5e-4a77-ab5b-a36b10fdede8" alt=""><figcaption></figcaption></figure>
{% endstep %}

{% step %}

#### Оберіть місце збереження шрифту

У вікні налаштувань виберіть **Settings → Store file to printer → Internal Flash → “…”**.

<figure><img src="https://331292232-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F4kHbNqhgtrlGjZyxZiDa%2Fuploads%2FZ0fWcAB1DlA5PFaopnyQ%2Fimage%203.png?alt=media&amp;token=ee07c780-3c02-471b-b62f-b23b076e6399" alt=""><figcaption></figcaption></figure>
{% endstep %}

{% step %}

#### Завантажте шрифт DEJAVUSANS\_LITE.TTF

Виберіть файл **DEJAVUSANS\_LITE.TTF** та натисніть **Send**.
{% endstep %}

{% step %}

#### Підтвердьте завантаження шрифту

Після завершення завантаження натисніть **OK** у діалоговому вікні налаштувань.
{% endstep %}

{% step %}

#### Завантажте шрифт DEJAVUSANS\_BLITE.TTF

Повторіть кроки 2–5 для файлу **DEJAVUSANS\_BLITE.TTF**.
{% endstep %}

{% step %}

#### Перезавантажте принтер

Після завантаження обох шрифтів перезавантажте принтер.
{% endstep %}
{% endstepper %}

### Результат

Після перезавантаження принтера обидва шрифти будуть доступні для використання, що забезпечить коректне відображення та друк маркування Nova Post.


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://api-portal.novapost.com/methods/nalashtuvannya-printera-zebra-dlya-druku-markuvannya-nova-post.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `build a script that syncs our docs to a CMS` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
