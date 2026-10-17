package com.bloodstock.domain;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Arrays;

public enum BloodGroup {
    O_NEG("O-"),
    O_POS("O+"),
    A_NEG("A-"),
    A_POS("A+"),
    B_NEG("B-"),
    B_POS("B+"),
    AB_NEG("AB-"),
    AB_POS("AB+");

    public static final BloodGroup O_MINUS = O_NEG;
    public static final BloodGroup O_PLUS = O_POS;
    public static final BloodGroup A_MINUS = A_NEG;
    public static final BloodGroup A_PLUS = A_POS;
    public static final BloodGroup B_MINUS = B_NEG;
    public static final BloodGroup B_PLUS = B_POS;
    public static final BloodGroup AB_MINUS = AB_NEG;
    public static final BloodGroup AB_PLUS = AB_POS;

    private final String code;

    BloodGroup(String code) {
        this.code = code;
    }

    @JsonValue
    public String getCode() {
        return code;
    }

    @Override
    public String toString() {
        return code;
    }

    @JsonCreator
    public static BloodGroup fromCode(String code) {
        if (code == null) {
            return null;
        }
        for (BloodGroup bg : values()) {
            if (bg.code.equalsIgnoreCase(code.trim())) {
                return bg;
            }
        }
        throw new IllegalArgumentException("Unknown blood group code: " + code);
    }
}
