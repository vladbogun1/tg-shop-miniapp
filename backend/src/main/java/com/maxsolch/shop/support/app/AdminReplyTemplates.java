package com.maxsolch.shop.support.app;

import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.support.app.ReplyTemplateDtos.TemplateDto;
import com.maxsolch.shop.support.app.ReplyTemplateDtos.TemplateUpsertRequest;
import org.springframework.stereotype.Service;

/** What the admin does with canned replies: runs the change and journals it. */
@Service
public class AdminReplyTemplates {

    private final ReplyTemplateService templates;
    private final AdminAuditService audit;

    public AdminReplyTemplates(ReplyTemplateService templates, AdminAuditService audit) {
        this.templates = templates;
        this.audit = audit;
    }

    public TemplateDto create(TemplateUpsertRequest req) {
        TemplateDto dto = templates.create(req);
        audit.record("REPLY_TEMPLATE_CREATE", "REPLY_TEMPLATE", String.valueOf(dto.id()), "шаблон «" + dto.title() + "»");
        return dto;
    }

    public TemplateDto update(long id, TemplateUpsertRequest req) {
        TemplateDto dto = templates.update(id, req);
        audit.record("REPLY_TEMPLATE_UPDATE", "REPLY_TEMPLATE", String.valueOf(id), "шаблон «" + dto.title() + "»");
        return dto;
    }

    public void delete(long id) {
        String title = templates.delete(id);
        audit.record("REPLY_TEMPLATE_DELETE", "REPLY_TEMPLATE", String.valueOf(id), "удалён шаблон «" + title + "»");
    }
}
