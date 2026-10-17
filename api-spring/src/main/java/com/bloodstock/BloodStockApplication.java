package com.bloodstock;

import com.bloodstock.config.AppConfig;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(AppConfig.class)
public class BloodStockApplication {

    public static void main(String[] args) {
        SpringApplication.run(BloodStockApplication.class, args);
    }
}
