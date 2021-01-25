package org.gainratio.amlfilter.search;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.extern.slf4j.Slf4j;
import org.apache.lucene.analysis.Analyzer;
import org.apache.lucene.analysis.TokenStream;
import org.apache.lucene.analysis.Tokenizer;
import org.apache.lucene.analysis.phonetic.DoubleMetaphoneFilter;
import org.apache.lucene.analysis.standard.StandardTokenizer;
import org.apache.lucene.document.Document;
import org.apache.lucene.document.Field;
import org.apache.lucene.document.StringField;
import org.apache.lucene.document.TextField;
import org.apache.lucene.index.DirectoryReader;
import org.apache.lucene.index.IndexReader;
import org.apache.lucene.index.IndexWriter;
import org.apache.lucene.index.IndexWriterConfig;
import org.apache.lucene.queryparser.classic.ParseException;
import org.apache.lucene.queryparser.classic.QueryParser;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.search.Query;
import org.apache.lucene.search.ScoreDoc;
import org.apache.lucene.search.TopDocs;
import org.apache.lucene.store.Directory;
import org.apache.lucene.store.RAMDirectory;
import org.gainratio.amlfilter.model.Entity;
import org.gainratio.amlfilter.model.Result;
import org.gainratio.amlfilter.model.SearchRecord;
import org.gainratio.amlfilter.service.EntityService;
import org.gainratio.amlfilter.service.ResultsService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

@Component
@Data
@Slf4j
@EqualsAndHashCode(callSuper = false)
public class LuceneSearch extends NameSearch {
    private Analyzer analyzer;
    private Directory index;
    @Autowired
    private EntityService entityService;
    @Autowired
    private ResultsService resultsService;
    private int maxResults = 1;

    boolean enabled = true;

    @PostConstruct
    public void init() throws IOException {
        analyzer = new Analyzer() {
            @Override
            protected TokenStreamComponents createComponents(String fieldName) {
                Tokenizer tokenizer = new StandardTokenizer();
                TokenStream stream = new DoubleMetaphoneFilter(tokenizer, 100, false);
                return new TokenStreamComponents(tokenizer, stream);
            }
        };
        index = new RAMDirectory();
        indexEntities();
    }

    private void indexEntities() throws IOException {
        int indexCount = 0;
        IndexWriterConfig config = new IndexWriterConfig(analyzer);
        IndexWriter indexWriter = new IndexWriter(index, config);
        try {
            for (Entity entity : entityService.getEntityCodeToEntityMap().values()) {
                for (String name : entity.getEntityNameSet()) {
                    Document doc = new Document();
                    doc.add(new TextField("name", name, Field.Store.YES));
                    doc.add(new StringField("entityCode", entity.getEntityCodeInSource(), Field.Store.YES));
                    indexWriter.addDocument(doc);
                    indexCount++;
                }
            }
        } finally {
            log.info("Indexed count: {}", indexCount);
            indexWriter.close();
        }
    }

    private List<Result> search(String searchName, int numHits) throws IOException {
        List<Result> resultList = new ArrayList<>();
        IndexReader indexReader = DirectoryReader.open(index);
        try {
            searchName = "name:\"" + searchName + "\"";
            Query q = new QueryParser("name", analyzer).parse(QueryParser.escape(searchName));
            IndexSearcher searcher = new IndexSearcher(indexReader);
            TopDocs docs = searcher.search(q, numHits);
            ScoreDoc[] hits = docs.scoreDocs;

            log.debug("Found " + hits.length + " hits.");
            for (int i = 0; i < hits.length; ++i) {
                int docId = hits[i].doc;
                Document d = searcher.doc(docId);
                String entityCode = d.get("entityCode");
                String resultName = d.get("name");
                log.debug((i + 1) + ". " + entityCode + "\t" + resultName + "\t" + hits[i].score);
                Result result = resultsService.createResult(searchName, resultName,
                        entityCode,
                        "SDN",
                        getClass().getSimpleName(),
                        1d);
                resultList.add(result);
            }
            return resultList;
        }
        catch (ParseException pe) {
            log.error("Could not parse query: ", pe);
        }
        finally {
            indexReader.close();
        }
        return resultList;
    }

    @Override
    public List<Result> executeQuery(SearchRecord searchRecord) {
        List<Result> finalResults = new ArrayList<>();
        if (!enabled) {
            return finalResults;
        }
        try {
            finalResults.addAll(search(searchRecord.getCleanedName(), maxResults));
            if (!searchRecord.getCleanedName().equals(searchRecord.getSynonimicName())) {
                finalResults.addAll(search(searchRecord.getSynonimicName(), maxResults));
            }
        } catch (Exception e) {
            log.error("ERROR: ", e);
        } finally {
        }
        return finalResults;
    }
}

