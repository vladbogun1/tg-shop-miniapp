package com.maxsolch.shop.architecture.v2;

import com.maxsolch.shop.architecture.v2.Placement.Layer;
import com.maxsolch.shop.architecture.v2.Placement.Place;
import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
import com.tngtech.archunit.core.domain.JavaConstructorCall;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaMethodCall;
import com.tngtech.archunit.core.domain.JavaModifier;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.function.Predicate;

/**
 * The rules of the target architecture (docs/ARCHITECTURE.md, sections 2.2 and 3), written for the target packages.
 * Each violation is a distinct {@code Class -> detail} pair attributed to the module of the class that breaks the
 * rule; {@link ArchitectureV2Test} compares the counts per rule and module with {@code v2-baseline.txt}.
 */
final class V2Rules {

    record Violation(String rule, String module, String key) {
    }

    /** Rule id -> what it protects; the order is the order of the report. */
    static final java.util.Map<String, String> RULES = new java.util.LinkedHashMap<>();

    static {
        RULES.put("R1", "every class lies in <module>.{api,app,domain,infra} or platform (the root package holds the entry point only)");
        RULES.put("L1", "api does not use infra (repositories, Jdbc) of any module");
        RULES.put("L2", "app and domain do not use api (controllers, DTOs)");
        RULES.put("L3", "domain knows no web, Jdbc, HTTP clients, Spring stereotypes, app or infra");
        RULES.put("L4", "infra depends on domain only (not on app or api)");
        RULES.put("M1", "another module is called through its app only (not its api or infra)");
        RULES.put("M2", "no dependency against the module direction, and no cycle between modules of one row (SCC of the module graph)");
        RULES.put("M3", "SQL/JPQL strings of a module touch its own tables and entities only (analytics, finance, inbox read any); the rest asks the owner through a port");
        RULES.put("L5", "app knows no web types (org.springframework.web.*, jakarta.servlet.*): requests are parsed in api");
        RULES.put("P1", "platform knows no business module");
        RULES.put("E1", "business errors are DomainException with an ErrorCode (no other RuntimeException subclass, no ResponseStatusException)");
        RULES.put("E2", "an error reason is an enum constant (no class or lambda implementing ErrorCode outside platform.error, no ErrorCode built from a string)");
        RULES.put("T1", "after commit only through domain events (no TransactionSynchronizationManager)");
        RULES.put("T2", "@Transactional only on public methods of app (not api, domain, infra)");
        RULES.put("A1", "current actor through CurrentActor (SecurityContextHolder only in platform.web and platform.security)");
        RULES.put("A2", "controllers do not write the audit log or the activity journal (a scenario in app does)");
        RULES.put("A3", "rights by annotations only (neither api nor app calls AdminAccess.require*; a rule that depends on a request parameter is the exception)");
        RULES.put("N1", "Telegram and push only from notification and *Notifier");
        RULES.put("T3", "events are published through platform.tx.DomainEvents only (no ApplicationEventPublisher)");
        RULES.put("T4", "listeners are @OnCommitted/@OnCompleted (no @TransactionalEventListener; @EventListener only for Spring's own events)");
        RULES.put("T5", "an event is a type of <module>.domain (or platform), never of app/api/infra");
        RULES.put("K1", "no in-memory locks or concurrent collections (synchronized, locks, Concurrent*/CopyOnWrite* by declared or created type): locks live in the database");
        RULES.put("C1", "time through Clock and ShopZone, everywhere (no Instant.now(), ZoneId.of, Clock.system*, System.currentTimeMillis/nanoTime, new Date(), static ShopZone.of/DEFAULT)");
        RULES.put("V1", "no @Value: settings through @ConfigurationProperties");
        RULES.put("V2", "@ConfigurationProperties classes are @Validated");
        RULES.put("CA", "cache only through Spring Cache (no Caffeine outside platform.cache: sizes and lifetimes are CacheSpec beans)");
        RULES.put("K2", "no volatile fields that hold data (a flag is fine; a memo is a Spring cache)");
        RULES.put("J2", "threads and executors only from platform.jobs (no Executors.*, new Thread/ThreadPoolExecutor, CompletableFuture.*Async)");
        RULES.put("J1", "@Scheduled only in *Job/*Jobs and always with @SchedulerLock");
        RULES.put("H1", "external HTTP only through platform.http (no HttpClient.newBuilder, RestTemplate)");
        RULES.put("W1", "dependencies by constructor only (no field/setter @Autowired, @Inject, @Resource, @PersistenceContext, required=false, @Lazy)");
        RULES.put("S1", "JdbcTemplate and native EntityManager queries only in the infra layer (no exemption by class name)");
        RULES.put("O1", "order status changes only through Order methods (no setStatus from outside)");
        RULES.put("O2", "an entity with invariants (GUARDED) is changed only by its own methods: no set* call from outside its domain package");
        RULES.put("O3", "an entity with invariants (GUARDED) has no public set* method (no @Setter)");
    }

    private static final String SPRING_VALUE = "org.springframework.beans.factory.annotation.Value";
    private static final String AUTOWIRED = "org.springframework.beans.factory.annotation.Autowired";
    private static final String LAZY = "org.springframework.context.annotation.Lazy";
    private static final String TRANSACTIONAL = "org.springframework.transaction.annotation.Transactional";
    private static final Set<String> JDBC = Set.of("org.springframework.jdbc.core.JdbcTemplate",
            "org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate");
    /** Field/method injection that is not a constructor, besides {@code @Autowired}/{@code @Lazy}. */
    private static final Set<String> OTHER_INJECTION = Set.of("jakarta.persistence.PersistenceContext",
            "jakarta.persistence.PersistenceUnit", "jakarta.annotation.Resource", "jakarta.inject.Inject",
            "javax.inject.Inject");

    /**
     * The whole list of classes exempt from a rule, in one place: rule -> class (relative to the root) -> why.
     * Nothing else is exempt; the same list is described in docs/ARCHITECTURE-CHECKS.md.
     */
    private static final java.util.Map<String, java.util.Map<String, String>> ALLOWED = java.util.Map.of(
            "S1", java.util.Map.of("platform.jobs.JobsConfig",
                    "ShedLock's JDBC lock provider is built from a JdbcTemplate; it is wiring next to @EnableSchedulerLock",
                    "platform.journal.ActivityLogStore", "platform has no infra layer: the journal's own table activity_log is read and written by its own store",
                    "platform.security.AdminRevokedTokenStore", "platform has no infra layer: the revoked admin tokens table belongs to platform.security"),
            "K1", java.util.Map.of(
                    "payment.app.CustomerPaymentRefresh", "ARCHITECTURE.md section 6: 5-second poll throttle, a spare poll is harmless",
                    "platform.config.WebSocketConfig", "ARCHITECTURE.md section 6: a connection belongs to the process by nature"),
            "M3", java.util.Map.ofEntries(
                    java.util.Map.entry("gift.infra.GiftQueries", "report over orders, order_items, order_gift_cases: one statement counts across the tables, splitting it would send every order through the JVM"),
                    java.util.Map.entry("gift.infra.GiftRegistryStore", "registry report: gift lines joined with their order and product price, read-only"),
                    java.util.Map.entry("gift.infra.GiftReminderStore", "scan of expiring gift-case promo codes joined with order and bot_blocked; claim is one atomic update of the code"),
                    java.util.Map.entry("review.infra.ReviewStore", "review scans and feed joined with order, product and promo rows, plus once-only claims written with 'update ... where flag is null' (atomic)"),
                    java.util.Map.entry("staff.infra.IncidentQueries", "the admin incident report: audit log, orders and money movements in one read"),
                    java.util.Map.entry("staff.infra.AdminTeamQueries", "the admin team screen: one activity summary per admin over audit, chat, broadcasts, marks and push rows, read-only")),
            "A3", java.util.Map.of(
                    "catalog.app.AdminCatalog", "force=1 on deleting a characteristic is for the main admin: the rule reads a request parameter, a method annotation cannot see it",
                    "translation.app.AdminTranslations", "deleting a whole language (blank entityId) is for the main admin: the rule reads a request parameter"),
            "E1", java.util.Map.of("payment.domain.MonobankGateway",
                    "MonobankException is a failure of the port, always caught in payment.app and turned into a DomainException; it never reaches HTTP"),
            "C1", java.util.Map.of(
                    "platform.time.TimeConfig", "the one place that creates the system Clock and the ShopZone bean",
                    "platform.time.ShopZone", "the one place that parses a zone id",
                    "platform.jobs.DbLocks", "System.nanoTime is a monotonic deadline for waiting on a DB lock, not a date"));

    /**
     * Entities that carry an invariant (money, status, counters that must stay consistent): they have no public
     * setters, every change is a method of the entity. Relative to the root. The other entities are plain
     * records of reference data and settings (see ARCHITECTURE.md, section 3, «Сущности»).
     */
    static final Set<String> GUARDED = Set.of(
            "order.domain.Order", "order.domain.OrderItem", "order.domain.OrderItemLot",
            "payment.domain.PaymentInvoice", "returns.domain.OrderReturn", "returns.domain.OrderReturnLine");

    private final Placement placement;
    private final String root;

    V2Rules(String root) {
        this.root = root;
        this.placement = new Placement(root);
    }

    List<Violation> evaluate(JavaClasses classes) {
        List<Violation> out = new ArrayList<>();
        List<Edge> edges = new ArrayList<>();
        for (JavaClass c : classes) {
            if (!placement.inProject(c) || c.getSimpleName().equals("package-info")) {
                continue;
            }
            Place from = placement.place(c);
            String origin = Placement.outermost(c).getName();
            List<Violation> own = new ArrayList<>();
            placementRule(from, origin, own);
            layering(c, from, origin, own, edges);
            practices(c, from, origin, own);
            members(c, from, origin, own);
            guardedEntity(c, from, origin, own);
            own.stream().filter(v -> !isAllowed(v.rule(), origin)).forEach(out::add);
        }
        cyclesInsideTiers(edges).stream().filter(v -> !isAllowed(v.rule(), v.key().split(" -> ")[0])).forEach(out::add);
        return out.stream().distinct().toList();
    }

    /** M3: the SQL of every module reads its own tables only; sources are read from disk (bytecode does not show strings). */
    List<Violation> sqlOwnership(java.nio.file.Path sources) {
        return SqlOwnership.scan(sources, root).stream().filter(v -> !isAllowed(v.rule(), v.key().split(" -> ")[0])).toList();
    }

    /** A dependency between two business modules, kept to find cycles in the module graph. */
    private record Edge(String from, String to, String detail) {
    }

    /**
     * M2, second half: modules of one row may know each other, but not in a circle. Strongly connected components of the
     * module graph (Tarjan); every dependency inside a component between two modules of one row is a violation.
     */
    private static List<Violation> cyclesInsideTiers(List<Edge> edges) {
        java.util.Map<String, java.util.Set<String>> graph = new java.util.HashMap<>();
        for (Edge e : edges) {
            graph.computeIfAbsent(e.from(), k -> new java.util.HashSet<>()).add(e.to());
            graph.computeIfAbsent(e.to(), k -> new java.util.HashSet<>());
        }
        java.util.Map<String, Integer> component = new java.util.HashMap<>();
        new Object() {
            int counter;
            int comp;
            final java.util.Map<String, Integer> index = new java.util.HashMap<>();
            final java.util.Map<String, Integer> low = new java.util.HashMap<>();
            final java.util.Deque<String> stack = new java.util.ArrayDeque<>();
            final java.util.Set<String> onStack = new java.util.HashSet<>();

            void run() {
                graph.keySet().stream().sorted().filter(n -> !index.containsKey(n)).forEach(this::visit);
            }

            void visit(String v) {
                index.put(v, counter);
                low.put(v, counter++);
                stack.push(v);
                onStack.add(v);
                for (String w : graph.get(v)) {
                    if (!index.containsKey(w)) {
                        visit(w);
                        low.put(v, Math.min(low.get(v), low.get(w)));
                    } else if (onStack.contains(w)) {
                        low.put(v, Math.min(low.get(v), index.get(w)));
                    }
                }
                if (low.get(v).equals(index.get(v))) {
                    String w;
                    do {
                        w = stack.pop();
                        onStack.remove(w);
                        component.put(w, comp);
                    } while (!w.equals(v));
                    comp++;
                }
            }
        }.run();
        List<Violation> out = new ArrayList<>();
        for (Edge e : edges) {
            boolean sameRow = Placement.TIER_OF.get(e.from()).equals(Placement.TIER_OF.get(e.to()));
            if (sameRow && component.get(e.from()).equals(component.get(e.to()))) {
                out.add(new Violation("M2", e.from(), e.detail() + " (a cycle between modules of one row)"));
            }
        }
        return out;
    }

    private boolean isGuarded(String className) {
        return className.startsWith(root + ".") && GUARDED.contains(className.substring(root.length() + 1));
    }

    private static boolean isSetter(String name) {
        return name.length() > 3 && name.startsWith("set") && Character.isUpperCase(name.charAt(3));
    }

    private static boolean samePackage(String a, String b) {
        return a.equals(b);
    }

    /** O3: an entity with invariants exposes no public setter (what Lombok's @Setter would generate). */
    private void guardedEntity(JavaClass c, Place from, String origin, List<Violation> out) {
        if (!isGuarded(c.getName())) {
            return;
        }
        for (JavaMethod m : c.getMethods()) {
            if (m.getModifiers().contains(JavaModifier.PUBLIC) && isSetter(m.getName())) {
                out.add(new Violation("O3", from.module(), origin + "." + m.getName()));
            }
        }
    }

    private boolean isAllowed(String rule, String origin) {
        String relative = origin.startsWith(root + ".") ? origin.substring(root.length() + 1) : origin;
        return ALLOWED.getOrDefault(rule, java.util.Map.of()).containsKey(relative);
    }

    private void placementRule(Place from, String origin, List<Violation> out) {
        if (from.module().equals(Placement.OUTSIDE)) {
            out.add(new Violation("R1", from.module(), origin + " lies outside <module>.{api,app,domain,infra} and platform"));
        }
    }

    // ---- layering and module boundaries -------------------------------------------------------------------

    private void layering(JavaClass c, Place from, String origin, List<Violation> out, List<Edge> edges) {
        for (Dependency d : c.getDirectDependenciesFromSelf()) {
            JavaClass target = d.getTargetClass();
            if (Placement.outermost(target).equals(Placement.outermost(c))) {
                continue;
            }
            String detail = origin + " -> " + Placement.outermost(target).getName();
            Place to = placement.place(target);
            boolean tracked = placement.inProject(target);

            if (from.layer() == Layer.API && ((tracked && to.layer() == Layer.INFRA && !to.module().equals(Placement.PLATFORM))
                    || target.isAssignableTo("org.springframework.data.repository.Repository")
                    || JDBC.contains(target.getName()))) {
                out.add(new Violation("L1", from.module(), detail));
            }
            boolean appOrDomain = from.layer() == Layer.APP || from.layer() == Layer.DOMAIN;
            if (appOrDomain && tracked && to.layer() == Layer.API && !to.module().equals(Placement.PLATFORM)) {
                out.add(new Violation("L2", from.module(), detail));
            }
            if (from.layer() == Layer.DOMAIN && domainImpure(target, to, tracked)) {
                out.add(new Violation("L3", from.module(), detail));
            }
            if (from.layer() == Layer.INFRA && tracked && !to.module().equals(Placement.PLATFORM)
                    && (to.layer() == Layer.APP || to.layer() == Layer.API)) {
                out.add(new Violation("L4", from.module(), detail));
            }
            if (tracked && !to.module().equals(from.module()) && isBusinessModule(to.module())
                    && (to.layer() == Layer.API || to.layer() == Layer.INFRA)) {
                out.add(new Violation("M1", from.module(), detail));
            }
            if (tracked && isBusinessModule(from.module()) && isBusinessModule(to.module()) && !to.module().equals(from.module())) {
                edges.add(new Edge(from.module(), to.module(), detail));
            }
            if (tracked && isBusinessModule(from.module()) && isBusinessModule(to.module())
                    && !to.module().equals(from.module())
                    && Placement.TIER_OF.get(to.module()) < Placement.TIER_OF.get(from.module())) {
                out.add(new Violation("M2", from.module(), detail));
            }
            if (from.layer() == Layer.APP && (target.getName().startsWith("org.springframework.web.")
                    || target.getName().startsWith("jakarta.servlet."))) {
                out.add(new Violation("L5", from.module(), detail));
            }
            if (from.module().equals(Placement.PLATFORM) && tracked && !to.module().equals(Placement.PLATFORM)) {
                out.add(new Violation("P1", from.module(), detail));
            }
        }
    }

    private static boolean domainImpure(JavaClass target, Place to, boolean tracked) {
        String n = target.getName();
        if (n.startsWith("org.springframework.web.") || n.startsWith("org.springframework.jdbc.")
                || n.startsWith("org.springframework.stereotype.") || n.startsWith("java.net.http.")) {
            return true;
        }
        return tracked && !to.module().equals(Placement.PLATFORM)
                && (to.layer() == Layer.APP || to.layer() == Layer.API || to.layer() == Layer.INFRA);
    }

    private static boolean isBusinessModule(String module) {
        return Placement.TIER_OF.containsKey(module) && !module.equals(Placement.PLATFORM);
    }

    // ---- "one way to do it" rules ---------------------------------------------------------------------------

    private boolean inPlatformError(JavaClass c) {
        return c.getPackageName().equals(root + ".platform.error");
    }

    private void practices(JavaClass c, Place from, String origin, List<Violation> out) {
        boolean inPlatform = from.module().equals(Placement.PLATFORM);
        String pkg = c.getPackageName();
        for (Dependency d : c.getDirectDependenciesFromSelf()) {
            JavaClass t = d.getTargetClass();
            if (Placement.outermost(t).equals(Placement.outermost(c))) {
                continue;
            }
            String tn = Placement.outermost(t).getName();
            String detail = origin + " -> " + tn;
            if (!inPlatform && tn.equals("org.springframework.web.server.ResponseStatusException")) {
                out.add(new Violation("E1", from.module(), detail));
            }
            boolean manualTx = tn.equals("org.springframework.transaction.support.TransactionSynchronizationManager")
                    || tn.equals("org.springframework.transaction.support.TransactionSynchronization");
            if (manualTx && !pkg.equals(root + ".platform.tx")) {
                out.add(new Violation("T1", from.module(), detail));
            }
            if (tn.equals("org.springframework.security.core.context.SecurityContextHolder")
                    && !pkg.equals(root + ".platform.web") && !pkg.equals(root + ".platform.security")) {
                out.add(new Violation("A1", from.module(), detail));
            }
            if (from.layer() == Layer.API && (tn.equals(root + ".platform.audit.AdminAuditService")
                    || tn.equals(root + ".platform.journal.ActivityLog"))) {
                out.add(new Violation("A2", from.module(), detail));
            }
            if (isTelegram(tn, c, from)) {
                out.add(new Violation("N1", from.module(), detail));
            }
            if (tn.equals("org.springframework.context.ApplicationEventPublisher") && !pkg.equals(root + ".platform.tx")) {
                out.add(new Violation("T3", from.module(), detail));
            }
            if (!pkg.equals(root + ".platform.cache") && tn.startsWith("com.github.benmanes.caffeine.")) {
                out.add(new Violation("CA", from.module(), detail));
            }
            if (JDBC.contains(tn) && from.layer() != Layer.INFRA) {
                out.add(new Violation("S1", from.module(), detail));
            }
        }
        for (JavaMethodCall call : c.getMethodCallsFromSelf()) {
            String owner = call.getTargetOwner().getName();
            String name = call.getName();
            String detail = origin + " -> " + call.getTargetOwner().getSimpleName() + "." + name;
            if (from.layer() != Layer.INFRA && owner.equals("jakarta.persistence.EntityManager")
                    && (name.equals("createNativeQuery") || name.equals("createQuery") || name.equals("createNamedQuery"))) {
                out.add(new Violation("S1", from.module(), detail));
            }
            if ((from.layer() == Layer.API || from.layer() == Layer.APP) && owner.equals(root + ".platform.security.AdminAccess")
                    && name.startsWith("require")) {
                out.add(new Violation("A3", from.module(), detail));
            }
            if (isWallClock(owner, name, call)) {
                out.add(new Violation("C1", from.module(), detail));
            }
            if ((owner.equals("java.util.Collections") && name.startsWith("synchronized"))
                    || (owner.equals("java.util.concurrent.ConcurrentHashMap") && name.equals("newKeySet"))) {
                out.add(new Violation("K1", from.module(), detail));
            }
            if (!pkg.equals(root + ".platform.jobs") && isThreadStarter(owner, name)) {
                out.add(new Violation("J2", from.module(), detail));
            }
            if (!pkg.equals(root + ".platform.http") && owner.equals("java.net.http.HttpClient")
                    && (name.equals("newBuilder") || name.equals("newHttpClient"))) {
                out.add(new Violation("H1", from.module(), detail));
            }
            if (isGuarded(owner) && isSetter(name) && !samePackage(c.getPackageName(), call.getTargetOwner().getPackageName())) {
                out.add(new Violation("O2", from.module(), detail));
            }
            if ((owner.equals(root + ".domain.Order") || owner.equals(root + ".order.domain.Order")) && name.equals("setStatus")
                    && !Placement.outermost(c).getName().equals(owner)) {
                out.add(new Violation("O1", from.module(), detail));
            }
        }
        for (JavaConstructorCall call : c.getConstructorCallsFromSelf()) {
            JavaClass owner = call.getTargetOwner();
            String detail = origin + " -> new " + owner.getSimpleName();
            if (Placement.outermost(owner).equals(Placement.outermost(c))) {
                continue;
            }
            if (isConcurrentType(owner)) {
                out.add(new Violation("K1", from.module(), detail));
            }
            if (!pkg.equals(root + ".platform.jobs") && isThreadType(owner)) {
                out.add(new Violation("J2", from.module(), detail));
            }
            boolean dateNow = owner.getName().equals("java.util.Date") && call.getTarget().getRawParameterTypes().isEmpty();
            if (dateNow || owner.getName().equals(root + ".platform.time.ShopZone")) {
                out.add(new Violation("C1", from.module(), detail));
            }
        }
        if (c.isAnnotatedWith("org.springframework.boot.context.properties.ConfigurationProperties")
                && !c.isAnnotatedWith("org.springframework.validation.annotation.Validated")) {
            out.add(new Violation("V2", from.module(), origin + " is @ConfigurationProperties without @Validated"));
        }
    }

    /** The Telegram library used from outside notification and *Notifier classes. */
    private static boolean isTelegram(String targetName, JavaClass c, Place from) {
        boolean allowed = from.module().equals("notification")
                || Placement.outermost(c).getSimpleName().endsWith("Notifier");
        return !allowed && targetName.startsWith("org.telegram.");
    }

    private boolean isWallClock(String owner, String name, JavaMethodCall call) {
        boolean noClockArg = call.getTarget().getRawParameterTypes().stream()
                .noneMatch(p -> p.getName().equals("java.time.Clock"));
        switch (owner) {
            case "java.time.Instant", "java.time.LocalDate", "java.time.LocalDateTime", "java.time.LocalTime",
                 "java.time.ZonedDateTime", "java.time.OffsetDateTime", "java.time.Year", "java.time.YearMonth":
                return name.equals("now") && noClockArg;
            case "java.time.ZoneId":
                return name.equals("of") || name.equals("systemDefault");
            case "java.time.Clock":
                return name.equals("systemUTC") || name.equals("systemDefaultZone") || name.equals("system");
            case "java.lang.System":
                return name.equals("currentTimeMillis") || name.equals("nanoTime");
            case "java.util.TimeZone":
                return name.equals("getDefault") || name.equals("getTimeZone");
            default:
                return false;
        }
    }

    // ---- members: annotations, modifiers, fields ------------------------------------------------------------

    private void members(JavaClass c, Place from, String origin, List<Violation> out) {
        // @Value anywhere
        c.getFields().stream().filter(f -> f.isAnnotatedWith(SPRING_VALUE))
                .forEach(f -> out.add(new Violation("V1", from.module(), origin + "." + f.getName())));
        for (JavaCodeUnit unit : codeUnits(c)) {
            boolean valueParam = unit.getParameters().stream().anyMatch(p -> p.isAnnotatedWith(SPRING_VALUE));
            if (valueParam || unit.isAnnotatedWith(SPRING_VALUE)) {
                out.add(new Violation("V1", from.module(), origin + "." + unit.getName()));
            }
        }
        // @Transactional placement
        boolean badLayer = from.layer() == Layer.API || from.layer() == Layer.DOMAIN || from.layer() == Layer.INFRA;
        if (badLayer && (c.isAnnotatedWith(TRANSACTIONAL) || c.getMethods().stream().anyMatch(m -> m.isAnnotatedWith(TRANSACTIONAL)))) {
            out.add(new Violation("T2", from.module(), origin + " has @Transactional in layer " + from.layer()));
        }
        c.getMethods().stream()
                .filter(m -> m.isAnnotatedWith(TRANSACTIONAL) && !m.getModifiers().contains(JavaModifier.PUBLIC))
                .forEach(m -> out.add(new Violation("T2", from.module(), origin + "." + m.getName() + " is not public")));
        // injection style
        c.getFields().stream().filter(f -> f.isAnnotatedWith(AUTOWIRED) || f.isAnnotatedWith(LAZY)
                        || OTHER_INJECTION.stream().anyMatch(f::isAnnotatedWith))
                .forEach(f -> out.add(new Violation("W1", from.module(), origin + " field " + f.getName())));
        c.getMethods().stream().filter(m -> m.isAnnotatedWith(AUTOWIRED) || OTHER_INJECTION.stream().anyMatch(m::isAnnotatedWith))
                .forEach(m -> out.add(new Violation("W1", from.module(), origin + " method " + m.getName())));
        for (JavaCodeUnit unit : codeUnits(c)) {
            boolean notRequired = unit.tryGetAnnotationOfType(AUTOWIRED)
                    .map(a -> Boolean.FALSE.equals(a.get("required").orElse(Boolean.TRUE))).orElse(false);
            boolean lazyParam = unit.getParameters().stream().anyMatch(p -> p.isAnnotatedWith(LAZY));
            if (notRequired || lazyParam || unit.isAnnotatedWith(LAZY)) {
                out.add(new Violation("W1", from.module(), origin + " " + unit.getName()
                        + (notRequired ? " required=false" : " @Lazy")));
            }
        }
        events(c, from, origin, out);
        // in-memory locks
        c.getMethods().stream().filter(m -> m.getModifiers().contains(JavaModifier.SYNCHRONIZED))
                .forEach(m -> out.add(new Violation("K1", from.module(), origin + "." + m.getName() + " is synchronized")));
        c.getFields().stream().filter(f -> f.getModifiers().contains(JavaModifier.VOLATILE)
                        && !f.getRawType().getName().equals("boolean") && !f.getRawType().getName().equals("java.lang.Boolean"))
                .forEach(f -> out.add(new Violation("K2", from.module(), origin + " field " + f.getName())));
        c.getFields().stream().filter(f -> isConcurrentType(f.getRawType()))
                .forEach(f -> out.add(new Violation("K1", from.module(), origin + " field " + f.getName())));
        // E1: a business error is a DomainException, not another RuntimeException
        if (c.isAssignableTo("java.lang.RuntimeException") && !c.getName().equals("java.lang.RuntimeException")
                && !c.isAssignableTo(root + ".platform.error.DomainException")) {
            out.add(new Violation("E1", from.module(), origin + " extends RuntimeException but not DomainException"));
        }
        // E2: reasons are enum constants whose text lives in the bundles; ErrorCode.of("...") no longer exists
        if (!inPlatformError(c) && c.isAssignableTo(root + ".platform.error.ErrorCode") && !c.isEnum()
                && !c.getName().equals(root + ".platform.error.ErrorCode")) {
            out.add(new Violation("E2", from.module(), origin + " implements ErrorCode but is not an enum"));
        }
        // scheduled jobs
        for (JavaMethod m : c.getMethods()) {
            if (!m.isAnnotatedWith("org.springframework.scheduling.annotation.Scheduled")) {
                continue;
            }
            String zone = m.getAnnotationOfType("org.springframework.scheduling.annotation.Scheduled")
                    .get("zone").map(Object::toString).orElse("");
            if (!zone.isEmpty() && !zone.startsWith("${")) {
                out.add(new Violation("C1", from.module(), origin + "." + m.getName() + " has a hard-coded zone " + zone));
            }
            Predicate<String> jobName = n -> n.endsWith("Job") || n.endsWith("Jobs");
            boolean named = jobName.test(Placement.outermost(c).getSimpleName());
            boolean locked = m.isAnnotatedWith("net.javacrumbs.shedlock.spring.annotation.SchedulerLock");
            boolean rightLayer = from.layer() == Layer.APP || from.layer() == Layer.PLATFORM;
            if (!named || !locked || !rightLayer) {
                out.add(new Violation("J1", from.module(), origin + "." + m.getName()
                        + (named ? "" : " not in *Jobs") + (locked ? "" : " without @SchedulerLock")
                        + (rightLayer ? "" : " outside app")));
            }
        }
    }

    /** Listeners and the place of the event types (T4, T5). */
    private void events(JavaClass c, Place from, String origin, List<Violation> out) {
        boolean inTx = c.getPackageName().equals(root + ".platform.tx");
        String onCommitted = root + ".platform.tx.OnCommitted";
        String onCompleted = root + ".platform.tx.OnCompleted";
        for (JavaMethod m : c.getMethods()) {
            if (!inTx && m.isAnnotatedWith("org.springframework.transaction.event.TransactionalEventListener")) {
                out.add(new Violation("T4", from.module(), origin + "." + m.getName() + " is a raw @TransactionalEventListener"));
            }
            boolean springEvent = m.getRawParameterTypes().stream().noneMatch(placement::inProject);
            if (m.isAnnotatedWith("org.springframework.context.event.EventListener") && !springEvent) {
                out.add(new Violation("T4", from.module(), origin + "." + m.getName() + " is an @EventListener of a project event"));
            }
            if (m.isAnnotatedWith(onCommitted) || m.isAnnotatedWith(onCompleted)) {
                for (JavaClass p : m.getRawParameterTypes()) {
                    Place to = placement.place(p);
                    if (placement.inProject(p) && to.layer() != Layer.DOMAIN && !to.module().equals(Placement.PLATFORM)) {
                        out.add(new Violation("T5", from.module(), origin + "." + m.getName() + " listens to " + p.getSimpleName() + " of " + to.layer()));
                    }
                }
            }
        }
        String simple = Placement.outermost(c).getSimpleName();
        boolean named = simple.endsWith("Event") || simple.endsWith("Events");
        if (named && from.layer() != Layer.DOMAIN && from.layer() != Layer.PLATFORM) {
            out.add(new Violation("T5", from.module(), origin + " is named like an event but lies in " + from.layer()));
        }
    }

    private static boolean isThreadStarter(String owner, String name) {
        return owner.equals("java.util.concurrent.Executors")
                || (owner.equals("java.util.concurrent.CompletableFuture") && name.endsWith("Async"))
                || (owner.equals("java.lang.Thread") && (name.equals("startVirtualThread") || name.equals("ofVirtual") || name.equals("ofPlatform")));
    }

    private static boolean isThreadType(JavaClass t) {
        return Set.of("java.lang.Thread", "java.util.concurrent.ThreadPoolExecutor",
                "java.util.concurrent.ScheduledThreadPoolExecutor", "java.util.concurrent.ForkJoinPool", "java.util.Timer")
                .contains(t.getName());
    }

    /** Locks and concurrent collections, whatever the field is declared as: by the type that is created or held. */
    private static boolean isConcurrentType(JavaClass t) {
        String n = t.getName();
        String simple = t.getSimpleName();
        if (n.startsWith("java.util.concurrent.locks.") || n.equals("java.util.concurrent.Semaphore")) {
            return true;
        }
        return n.startsWith("java.util.concurrent.") && (simple.startsWith("Concurrent") || simple.startsWith("CopyOnWrite"));
    }

    private static List<JavaCodeUnit> codeUnits(JavaClass c) {
        List<JavaCodeUnit> units = new ArrayList<>(c.getMethods());
        units.addAll(c.getConstructors());
        return units;
    }
}
