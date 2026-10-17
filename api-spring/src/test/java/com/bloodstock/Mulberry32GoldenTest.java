package com.bloodstock;

import com.bloodstock.util.Mulberry32;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

public class Mulberry32GoldenTest {

    @Test
    @DisplayName("Mulberry32 matches first 20 outputs from Node.js implementation for seed 42")
    void testGoldenValues() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        InputStream is = getClass().getResourceAsStream("/golden_mulberry32.json");
        assertNotNull(is, "golden_mulberry32.json must exist in test resources");

        List<Double> goldenValues = mapper.readValue(is, new TypeReference<>() {});
        assertEquals(20, goldenValues.size());

        Mulberry32 rand = new Mulberry32(42);
        for (int i = 0; i < goldenValues.size(); i++) {
            double actual = rand.nextDouble();
            double expected = goldenValues.get(i);
            assertEquals(expected, actual, 1e-12, "Mismatch at PRNG index " + i);
        }
    }
}
