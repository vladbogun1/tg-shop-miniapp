package com.example.tgshop.settings;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "settings")
public class Setting {

  @Id
  @Column(name = "k", length = 128)
  private String key;

  @Column(name = "v", nullable = false, length = 2048)
  private String value;

  public Setting(String key, String value) {
    this.key = key;
    this.value = value;
  }
}
