package com.maxsolch.shop.ai.api;

import com.maxsolch.shop.ai.app.AiManualMarks;
import com.maxsolch.shop.ai.app.AiTaskList;
import com.maxsolch.shop.ai.app.AiWidget;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * The task center «ИИ-задачи», the dashboard line and the mark of the manual way. For every admin; the money and the
 * prompt are left out of the rows of an admin without the finance right.
 */
@RestController
@RequestMapping("/api/admin/ai")
@RequiredAdmin
@Tag(name = "Admin AI tasks", description = "Task center tabs, dashboard widget, mark of the manual way")
@SecurityRequirement(name = "bearer-jwt")
public class AdminAiTasksController {

    private final AiTaskList tasks;
    private final AiWidget widget;
    private final AiManualMarks marks;

    public AdminAiTasksController(AiTaskList tasks, AiWidget widget, AiManualMarks marks) {
        this.tasks = tasks;
        this.widget = widget;
        this.marks = marks;
    }

    @GetMapping("/jobs")
    @Operation(summary = "A page of tasks of a tab: active | review | problems | history (newest first), with the "
            + "counts of the tabs; rows carry who started the task and the name of its object")
    public AiTaskList.TaskPage list(@RequestParam(defaultValue = "review") String tab,
                                    @RequestParam(defaultValue = "0") int page,
                                    @RequestParam(defaultValue = "20") int size) {
        return tasks.page(tab, page, size);
    }

    @GetMapping("/widget")
    @Operation(summary = "The dashboard line: can the AI be started, what waits for review; month money for the finance right")
    public AiWidget.Widget widget() {
        return widget.widget();
    }

    @PostMapping("/manual-marks")
    @Operation(summary = "The manual way applied a result: one mark per product, the server decides the reason")
    public Map<String, Integer> mark(@RequestBody AiManualMarks.Mark body) {
        return Map.of("recorded", marks.record(body));
    }
}
