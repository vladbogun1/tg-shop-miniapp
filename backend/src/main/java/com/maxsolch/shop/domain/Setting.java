package com.maxsolch.shop.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "settings")
public class Setting {

    @Id
    @Column(name = "k", nullable = false, length = 128)
    private String key;

    @Column(name = "v", nullable = false, columnDefinition = "TEXT")
    private String value;
}
