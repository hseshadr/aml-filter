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
import java.util.stream.Collectors;

@Data
@AllArgsConstructor
public class VectorSpaceFlat {
    private static final Logger logger = LoggerFactory.getLogger(VectorSpaceFlat.class);
    private List<VectorDataFlat> vectorDataList;

    public static VectorSpaceFlat createTestVectorSpaceFlat() {
        List<VectorDataFlat> vectorDataFlatList = new ArrayList<>();
        VectorSpaceFlat vectorSpaceFlat
                = new VectorSpaceFlat(vectorDataFlatList);
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

    public static void main(String[] args) throws Exception {
        VectorSpaceFlat vectorSpaceFlat
                = createTestVectorSpaceFlat();
        vectorSpaceFlat.search("Harish Seshadri", 2);

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
        VectorDataFlat vectorDataFlat = new VectorDataFlat();
        vectorDataFlat.setId(id);
        vectorDataFlat.setData(name);
        byte[] vector = new byte[256];
        for (byte b : incomingData) {
            vector[b] += 1;
        }
        vectorDataFlat.setByteCoordinates(vector);

        logger.info("id={},name={},vector={}", id, name, Arrays.toString(vectorDataFlat.getByteCoordinates()));
        return vectorDataFlat;
    }

    public List<VectorResult> search(String name, int maxResults) {
        VectorDataFlat incomingVectorData = createVector(null, name);
        List<VectorResult> vectorResultList = vectorDataList.stream().parallel().map(vd -> {
            double sim = VectorUtils.computeCosineOfVectors(
                    incomingVectorData.getByteCoordinates(),
                    vd.getByteCoordinates());
            return new VectorResult(vd.getData(), sim, vd);
        }).sorted(new VectorResultCosineSimilarityComparator())
                .limit(maxResults)
                .collect(Collectors.toList());
        logger.info("vectorResultList={}", vectorResultList);
        return vectorResultList;
    }
}
