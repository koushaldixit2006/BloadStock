package com.bloodstock.domain;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "hospitals")
public class Hospital {

    @Id
    private String mongoId;

    @Indexed(unique = true)
    private String id;

    private String name;
    private String shortName;
    private Coordinates coords;
    private String tier;

    public record Coordinates(double x, double y) {}

    public Hospital() {}

    public Hospital(String id, String name, String shortName, Coordinates coords, String tier) {
        this.id = id;
        this.name = name;
        this.shortName = shortName;
        this.coords = coords;
        this.tier = tier;
    }

    public String getMongoId() { return mongoId; }
    public void setMongoId(String mongoId) { this.mongoId = mongoId; }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getShortName() { return shortName; }
    public void setShortName(String shortName) { this.shortName = shortName; }

    public Coordinates getCoords() { return coords; }
    public void setCoords(Coordinates coords) { this.coords = coords; }

    public String getTier() { return tier; }
    public void setTier(String tier) { this.tier = tier; }
}
