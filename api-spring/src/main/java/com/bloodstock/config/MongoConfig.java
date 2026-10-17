package com.bloodstock.config;

import com.bloodstock.domain.BloodGroup;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.data.convert.ReadingConverter;
import org.springframework.data.convert.WritingConverter;
import org.springframework.data.mongodb.MongoDatabaseFactory;
import org.springframework.data.mongodb.MongoTransactionManager;
import org.springframework.data.mongodb.config.EnableMongoAuditing;
import org.springframework.data.mongodb.core.convert.MongoCustomConversions;

import java.util.Arrays;

@Configuration
@EnableMongoAuditing
public class MongoConfig {

    @Bean
    public MongoTransactionManager transactionManager(MongoDatabaseFactory dbFactory) {
        return new MongoTransactionManager(dbFactory);
    }

    @Bean
    public MongoCustomConversions customConversions() {
        return new MongoCustomConversions(Arrays.asList(
                new BloodGroupWritingConverter(),
                new BloodGroupReadingConverter()
        ));
    }

    @WritingConverter
    public static class BloodGroupWritingConverter implements Converter<BloodGroup, String> {
        @Override
        public String convert(BloodGroup source) {
            return source != null ? source.getCode() : null;
        }
    }

    @ReadingConverter
    public static class BloodGroupReadingConverter implements Converter<String, BloodGroup> {
        @Override
        public BloodGroup convert(String source) {
            return source != null ? BloodGroup.fromCode(source) : null;
        }
    }
}
