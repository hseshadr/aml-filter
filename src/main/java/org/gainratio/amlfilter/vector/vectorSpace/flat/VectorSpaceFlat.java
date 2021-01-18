package org.gainratio.amlfilter.vector.vectorSpace.flat;

import lombok.AllArgsConstructor;
import lombok.Data;
import org.gainratio.amlfilter.util.AlgorithmUtils;
import org.gainratio.amlfilter.vector.utils.VectorUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Vector;
import java.util.stream.Collectors;

@Data
public class VectorSpaceFlat {
    private static final Logger logger = LoggerFactory.getLogger(VectorSpaceFlat.class);
    private static final String vectorTemplate = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ ";
    private static final double similarityThreshold = 0.95d;
    private List<VectorDataFlat> vectorDataList;

    public static VectorSpaceFlat createTestVectorSpaceFlat() {
        List<VectorDataFlat> vectorDataFlatList = new ArrayList<>();
        VectorSpaceFlat vectorSpaceFlat
                = new VectorSpaceFlat();
        vectorSpaceFlat.setVectorDataList(vectorDataFlatList);
        VectorDataFlat vectorDataFlat = vectorSpaceFlat.createVector("1", "Harish Seshadri");
        vectorDataFlatList.add(vectorDataFlat);
        // Second entry
        vectorDataFlat = vectorSpaceFlat.createVector("2", "Seshadri Harish");
        vectorDataFlatList.add(vectorDataFlat);
        // Third entry
        vectorDataFlat = vectorSpaceFlat.createVector("3", "Harry Sesh");
        vectorDataFlatList.add(vectorDataFlat);

        vectorSpaceFlat.setVectorDataList(vectorDataFlatList);
        return vectorSpaceFlat;
    }

    public VectorDataFlat createVector(String id, String name) {
        String normalizedName = AlgorithmUtils.cleanString(name);
        byte[] theBytes = normalizedName.getBytes(StandardCharsets.UTF_8);
        return createVector(
                id,
                normalizedName,
                theBytes
        );
    }

    private VectorDataFlat createVector(String id,
                                        String name,
                                        final byte[] incomingData) {
        VectorDataFlat vectorDataFlat = VectorDataFlat.builder()
                .id(id).data(name).build();
        int[] v1 = new int[37];
        Arrays.fill(v1, 1);
        int spaceIndex = 36;
        int startNumberOffset = 48;
        int startAlphabetOffset = 65 - 10;

        String phoneticStr = AlgorithmUtils.getDoubleMetaPhoneStr(name);
        int pos = 0;
        for (byte b : phoneticStr.getBytes(StandardCharsets.UTF_8)) {
            if (b == ' ') {
                v1[spaceIndex] *= pos;
            } else if (b >= 'A' && b <= 'Z') {
                v1[b - startAlphabetOffset] *= pos;
            } else if (b >= '0' && b <= '9') {
                v1[b - startNumberOffset] *= pos;
            } else {
                throw new IllegalArgumentException(String.format("Unidentified byte=%d", b));
            }
            pos++;
        }
        vectorDataFlat.setCoordinates(v1);

        //logger.info("id={},name={},vector={}", id, name, Arrays.toString(vectorDataFlat.getByteCoordinates()));
        return vectorDataFlat;
    }

    public List<VectorResult> search(String name) {
        VectorDataFlat incomingVectorData = createVector(null, name);
        List<VectorResult> vectorResultList = vectorDataList.stream().parallel().map(vd -> {
            double sim = VectorUtils.computeCosineOfVectors(
                    incomingVectorData.getCoordinates(),
                    vd.getCoordinates());
            return new VectorResult(vd.getData(), sim, vd);
        }).sorted(new VectorResultCosineSimilarityComparator())
                .collect(Collectors.toList());
        return filterVectorResults(vectorResultList);
    }

    private List<VectorResult> filterVectorResults(List<VectorResult> vectorResultList) {
        List<VectorResult> filteredVectorResults = new ArrayList<>();
        for (VectorResult vr : vectorResultList) {
            if (vr.getSimilarity() < similarityThreshold) {
                return filteredVectorResults;
            }
            filteredVectorResults.add(vr);
        }
        return filteredVectorResults;
    }
}
