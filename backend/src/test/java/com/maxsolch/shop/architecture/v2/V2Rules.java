package com.maxsolch.shop.architecture.v2;

import com.maxsolch.shop.architecture.v2.Placement.Layer;
import com.maxsolch.shop.architecture.v2.Placement.Place;
import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
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
        RULES.put("L1", "api does not use infra (repositories, Jdbc) of any module");
        RULES.put("L2", "app and domain do not use api (controllers, DTOs)");
        RULES.put("L3", "domain knows no web, Jdbc, HTTP clients, Spring stereotypes, app or infra");
        RULES.put("L4", "infra depends on domain only (not on app or api)");
        RULES.put("M1", "another module is called through its app only (not its api or infra)");
        RULES.put("M2", "no dependency against the module direction (lower modules do not know upper ones)");
        RULES.put("P1", "platform knows no business module");
        RULES.put("E1", "business errors are DomainException with an ErrorCode (no old web-style exceptions)");
        RULES.put("T1", "after commit only through domain events (no AfterCommit, TransactionSynchronizationManager)");
        RULES.put("T2", "@Transactional only on public methods of app (not api, domain, infra)");
        RULES.put("A1", "current actor through CurrentActor (no static SecurityUtil)");
        RULES.put("A2", "controllers do not write the audit log");
        RULES.put("A3", "rights by annotations only (controllers do not call AdminAccess.require*)");
        RULES.put("N1", "Telegram and push only from notification and *Notifier");
        RULES.put("K1", "no in-memory locks (synchronized, locks, ConcurrentHashMap fields): locks live in the database");
        RULES.put("C1", "time through Clock and ShopZone (no Instant.now(), ZoneId.of, Clock.system* outside platform)");
        RULES.put("V1", "no @Value: settings through @ConfigurationProperties");
        RULES.put("V2", "@ConfigurationProperties classes are @Validated");
        RULES.put("CA", "cache only through Spring Cache (no direct Caffeine outside platform)");
        RULES.put("J1", "@Scheduled only in *Job/*Jobs and always with @SchedulerLock");
        RULES.put("H1", "external HTTP only through platform.http (no HttpClient.newBuilder, RestTemplate)");
        RULES.put("W1", "dependencies by constructor only (no field/setter @Autowired, required=false, @Lazy)");
        RULES.put("S1", "JdbcTemplate only in infra, *Store and *Queries");
        RULES.put("O1", "order status changes only through Order methods (no setStatus from outside)");
    }

    private static final String SPRING_VALUE = "org.springframework.beans.factory.annotation.Value";
    private static final String AUTOWIRED = "org.springframework.beans.factory.annotation.Autowired";
    private static final String LAZY = "org.springframework.context.annotation.Lazy";
    private static final String TRANSACTIONAL = "org.springframework.transaction.annotation.Transactional";
    private static final Set<String> JDBC = Set.of("org.springframework.jdbc.core.JdbcTemplate",
            "org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate");
    private static final Set<String> OLD_EXCEPTIONS = Set.of("BadRequestException", "NotFoundException",
            "ConflictException", "ForbiddenException", "UnauthorizedException", "TooManyRequestsException");

    /**
     * The one JdbcTemplate user outside infra: ShedLock's JDBC lock provider is built from a JdbcTemplate. It is wiring
     * (a bean definition), not data access, and it has to live next to {@code @EnableSchedulerLock}.
     */
    private final String jobsConfig;
    private final Placement placement;
    private final String root;

    V2Rules(String root) {
        this.root = root;
        this.jobsConfig = root + ".platform.jobs.JobsConfig";
        this.placement = new Placement(root);
    }

    List<Violation> evaluate(JavaClasses classes) {
        List<Violation> out = new ArrayList<>();
        for (JavaClass c : classes) {
            if (!placement.inProject(c) || c.getSimpleName().equals("package-info")) {
                continue;
            }
            Place from = placement.place(c);
            String origin = Placement.outermost(c).getName();
            layering(c, from, origin, out);
            practices(c, from, origin, out);
            members(c, from, origin, out);
        }
        return out.stream().distinct().toList();
    }

    // ---- layering and module boundaries -------------------------------------------------------------------

    private void layering(JavaClass c, Place from, String origin, List<Violation> out) {
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
            if (tracked && isBusinessModule(from.module()) && isBusinessModule(to.module())
                    && !to.module().equals(from.module())
                    && Placement.TIER_OF.get(to.module()) < Placement.TIER_OF.get(from.module())) {
                out.add(new Violation("M2", from.module(), detail));
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
            if (tn.startsWith(root + ".platform.error.") && OLD_EXCEPTIONS.contains(t.getSimpleName())
                    && !pkg.equals(root + ".platform.error")) {
                out.add(new Violation("E1", from.module(), detail));
            }
            boolean manualTx = tn.equals(root + ".platform.tx.AfterCommit")
                    || tn.equals("org.springframework.transaction.support.TransactionSynchronizationManager")
                    || tn.equals("org.springframework.transaction.support.TransactionSynchronization");
            if (manualTx && !pkg.equals(root + ".platform.tx")) {
                out.add(new Violation("T1", from.module(), detail));
            }
            if (tn.equals(root + ".platform.web.SecurityUtil") && !pkg.equals(root + ".platform.web")) {
                out.add(new Violation("A1", from.module(), detail));
            }
            if (from.layer() == Layer.API && tn.equals(root + ".platform.audit.AdminAuditService")) {
                out.add(new Violation("A2", from.module(), detail));
            }
            if (isTelegram(tn, pkg, c, from)) {
                out.add(new Violation("N1", from.module(), detail));
            }
            if (!inPlatform && tn.equals("com.github.benmanes.caffeine.cache.Caffeine")) {
                out.add(new Violation("CA", from.module(), detail));
            }
            if (JDBC.contains(tn) && from.layer() != Layer.INFRA && !c.getSimpleName().endsWith("Store")
                    && !c.getSimpleName().endsWith("Queries") && !origin.equals(jobsConfig)) {
                out.add(new Violation("S1", from.module(), detail));
            }
        }
        for (JavaMethodCall call : c.getMethodCallsFromSelf()) {
            String owner = call.getTargetOwner().getName();
            String name = call.getName();
            String detail = origin + " -> " + call.getTargetOwner().getSimpleName() + "." + name;
            if (from.layer() == Layer.API && owner.equals(root + ".platform.security.AdminAccess") && name.startsWith("require")) {
                out.add(new Violation("A3", from.module(), detail));
            }
            if (!inPlatform && isWallClock(owner, name, call)) {
                out.add(new Violation("C1", from.module(), detail));
            }
            if (!pkg.equals(root + ".platform.http") && owner.equals("java.net.http.HttpClient")
                    && (name.equals("newBuilder") || name.equals("newHttpClient"))) {
                out.add(new Violation("H1", from.module(), detail));
            }
            if ((owner.equals(root + ".domain.Order") || owner.equals(root + ".order.domain.Order")) && name.equals("setStatus")
                    && !Placement.outermost(c).getName().equals(owner)) {
                out.add(new Violation("O1", from.module(), detail));
            }
        }
        if (c.isAnnotatedWith("org.springframework.boot.context.properties.ConfigurationProperties")
                && !c.isAnnotatedWith("org.springframework.validation.annotation.Validated")) {
            out.add(new Violation("V2", from.module(), origin + " is @ConfigurationProperties without @Validated"));
        }
    }

    /** Telegram library, or the legacy tg/push packages, used from outside notification and *Notifier classes. */
    private boolean isTelegram(String targetName, String originPkg, JavaClass c, Place from) {
        boolean viaLibrary = targetName.startsWith("org.telegram.");
        boolean viaLegacy = targetName.startsWith(root + ".tg.") || targetName.startsWith(root + ".push.");
        boolean insideLegacyBlob = originPkg.equals(root + ".tg") || originPkg.equals(root + ".push");
        boolean allowed = from.module().equals("notification")
                || Placement.outermost(c).getSimpleName().endsWith("Notifier");
        return !allowed && (viaLibrary || (viaLegacy && !insideLegacyBlob));
    }

    private static boolean isWallClock(String owner, String name, JavaMethodCall call) {
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
        c.getFields().stream().filter(f -> f.isAnnotatedWith(AUTOWIRED) || f.isAnnotatedWith(LAZY))
                .forEach(f -> out.add(new Violation("W1", from.module(), origin + " field " + f.getName())));
        c.getMethods().stream().filter(m -> m.isAnnotatedWith(AUTOWIRED))
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
        // in-memory locks
        c.getMethods().stream().filter(m -> m.getModifiers().contains(JavaModifier.SYNCHRONIZED))
                .forEach(m -> out.add(new Violation("K1", from.module(), origin + "." + m.getName() + " is synchronized")));
        c.getFields().stream().filter(f -> f.getRawType().getName().equals("java.util.concurrent.ConcurrentHashMap")
                        || f.getRawType().getName().startsWith("java.util.concurrent.locks."))
                .forEach(f -> out.add(new Violation("K1", from.module(), origin + " field " + f.getName())));
        // scheduled jobs
        for (JavaMethod m : c.getMethods()) {
            if (!m.isAnnotatedWith("org.springframework.scheduling.annotation.Scheduled")) {
                continue;
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

    private static List<JavaCodeUnit> codeUnits(JavaClass c) {
        List<JavaCodeUnit> units = new ArrayList<>(c.getMethods());
        units.addAll(c.getConstructors());
        return units;
    }
}
