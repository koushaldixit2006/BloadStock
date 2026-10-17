package com.bloodstock.util;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class CanonicalJson {

    private static final DateTimeFormatter ISO_FORMATTER =
            DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(java.time.ZoneOffset.UTC);

    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static String formatInstant(Instant instant) {
        return ISO_FORMATTER.format(instant);
    }

    public static String canonicalize(Object obj) {
        if (obj == null) {
            return "null";
        }
        if (obj instanceof Instant instant) {
            try {
                return MAPPER.writeValueAsString(formatInstant(instant));
            } catch (JsonProcessingException e) {
                throw new RuntimeException(e);
            }
        }
        JsonNode node;
        if (obj instanceof JsonNode jn) {
            node = jn;
        } else {
            node = MAPPER.valueToTree(obj);
        }
        return canonicalizeNode(node);
    }

    public static String canonicalizeNode(JsonNode node) {
        if (node == null || node.isNull()) {
            return "null";
        }
        if (node.isBoolean()) {
            return node.asBoolean() ? "true" : "false";
        }
        if (node.isNumber()) {
            return node.asText();
        }
        if (node.isTextual()) {
            try {
                return MAPPER.writeValueAsString(node.asText());
            } catch (JsonProcessingException e) {
                throw new RuntimeException(e);
            }
        }
        if (node.isArray()) {
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < node.size(); i++) {
                if (i > 0) sb.append(",");
                sb.append(canonicalizeNode(node.get(i)));
            }
            sb.append("]");
            return sb.toString();
        }
        if (node.isObject()) {
            List<String> fieldNames = new ArrayList<>();
            node.fieldNames().forEachRemaining(fieldNames::add);
            Collections.sort(fieldNames);
            StringBuilder sb = new StringBuilder("{");
            for (int i = 0; i < fieldNames.size(); i++) {
                if (i > 0) sb.append(",");
                String key = fieldNames.get(i);
                try {
                    sb.append(MAPPER.writeValueAsString(key));
                } catch (JsonProcessingException e) {
                    throw new RuntimeException(e);
                }
                sb.append(":");
                sb.append(canonicalizeNode(node.get(key)));
            }
            sb.append("}");
            return sb.toString();
        }
        return node.toString();
    }

    public static String computeAuditHash(String prevHash, Object payload) {
        String serialized = canonicalize(payload);
        String data = prevHash + serialized;
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hashBytes) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 algorithm not available", e);
        }
    }
}
