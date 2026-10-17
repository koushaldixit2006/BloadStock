package com.bloodstock.domain;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Document(collection = "users")
public class User {

    @Id
    private String mongoId;

    @Indexed(unique = true)
    private String id;

    @Indexed(unique = true)
    private String email;

    private String passwordHash;
    private String name;
    private Role role;
    private String hospitalId;

    private List<RefreshTokenEntry> refreshTokens = new ArrayList<>();

    public record RefreshTokenEntry(String token, Instant expiresAt, Instant createdAt) {}

    public User() {}

    public User(String id, String email, String passwordHash, String name, Role role, String hospitalId) {
        this.id = id;
        this.email = email;
        this.passwordHash = passwordHash;
        this.name = name;
        this.role = role;
        this.hospitalId = hospitalId;
    }

    public String getMongoId() { return mongoId; }
    public void setMongoId(String mongoId) { this.mongoId = mongoId; }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public Role getRole() { return role; }
    public void setRole(Role role) { this.role = role; }

    public String getHospitalId() { return hospitalId; }
    public void setHospitalId(String hospitalId) { this.hospitalId = hospitalId; }

    public List<RefreshTokenEntry> getRefreshTokens() { return refreshTokens; }
    public void setRefreshTokens(List<RefreshTokenEntry> refreshTokens) { this.refreshTokens = refreshTokens; }
}
