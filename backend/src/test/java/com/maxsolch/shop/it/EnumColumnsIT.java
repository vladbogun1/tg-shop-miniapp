package com.maxsolch.shop.it;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Embedded;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.metamodel.EntityType;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Status-like columns are {@code VARCHAR}, not MySQL {@code ENUM} (V78): a new Java constant must not need an ALTER on a big table.
 * The price is that the database no longer rejects a value it does not know, so this test is the guard (a CHECK would bring
 * back an ALTER per new value): for every {@code @Enumerated(STRING)} field of every entity the column must exist as
 * VARCHAR, {@code @Column(length)} must equal its real length, and the longest constant must fit. A new ENUM column in a
 * migration fails here too.
 */
class EnumColumnsIT extends AbstractMysqlIT {

    @Autowired
    EntityManagerFactory emf;

    @Test
    void noMysqlEnumColumnsRemain() {
        List<String> enums = jdbc.queryForList("SELECT CONCAT(table_name, '.', column_name) FROM information_schema.columns "
                + "WHERE table_schema = DATABASE() AND data_type = 'enum'", String.class);
        assertThat(enums).as("use VARCHAR(N) + a Java enum, not MySQL ENUM").isEmpty();
    }

    @Test
    void enumFieldsMatchTheirVarcharColumns() {
        List<String> problems = new ArrayList<>();
        int checked = 0;
        for (EntityType<?> type : emf.getMetamodel().getEntities()) {
            Table table = type.getJavaType().getAnnotation(Table.class);
            if (table == null) {
                continue;
            }
            for (Field f : enumFields(type.getJavaType())) {
                checked++;
                check(table.name(), f, problems);
            }
        }
        assertThat(checked).as("fields checked").isGreaterThan(15);
        assertThat(problems).isEmpty();
    }

    private void check(String table, Field f, List<String> problems) {
        Column col = f.getAnnotation(Column.class);
        String name = col == null || col.name().isEmpty() ? f.getName() : col.name().replace("`", "");
        String where = table + "." + name + " (" + f.getDeclaringClass().getSimpleName() + "." + f.getName() + ")";
        List<Integer> db = jdbc.query("SELECT character_maximum_length FROM information_schema.columns "
                        + "WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? AND data_type = 'varchar'",
                (rs, i) -> rs.getInt(1), table, name);
        if (db.isEmpty()) {
            problems.add(where + ": no VARCHAR column");
            return;
        }
        int declared = col == null ? 255 : col.length();
        if (declared != db.get(0)) {
            problems.add(where + ": @Column length " + declared + " but the database has " + db.get(0));
        }
        int longest = Arrays.stream(f.getType().getEnumConstants()).mapToInt(c -> ((Enum<?>) c).name().length()).max().orElse(0);
        if (longest > db.get(0)) {
            problems.add(where + ": constant of " + longest + " chars does not fit " + db.get(0));
        }
    }

    /** Fields of the class, its superclasses and its embedded ids/components that carry {@code @Enumerated}. */
    private static List<Field> enumFields(Class<?> cls) {
        List<Field> out = new ArrayList<>();
        for (Class<?> c = cls; c != null && c != Object.class; c = c.getSuperclass()) {
            for (Field f : c.getDeclaredFields()) {
                if (f.isAnnotationPresent(Enumerated.class)) {
                    out.add(f);
                } else if ((f.isAnnotationPresent(EmbeddedId.class) || f.isAnnotationPresent(Embedded.class))
                        && f.getType().isAnnotationPresent(Embeddable.class)) {
                    out.addAll(enumFields(f.getType()));
                }
            }
        }
        return out;
    }
}
